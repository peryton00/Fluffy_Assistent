"""
Model Context Protocol (MCP) Transport Implementations
Provides offline Stdio process transport and deterministic InMemory transport.
"""

from abc import ABC, abstractmethod
import subprocess
import threading
import queue
import time
import os
from typing import Optional, Dict, Any, List, Callable


class MCPTransport(ABC):
    """Abstract transport interface for MCP communication."""

    @abstractmethod
    def connect(self) -> None:
        """Establish transport connection or start local process."""
        pass

    @abstractmethod
    def send(self, message: str) -> None:
        """Send message string over transport."""
        pass

    @abstractmethod
    def receive(self, timeout: Optional[float] = None) -> str:
        """Receive message string over transport with optional timeout."""
        pass

    @abstractmethod
    def close(self) -> None:
        """Close connection and clean up resources."""
        pass

    @property
    @abstractmethod
    def is_connected(self) -> bool:
        """Check if transport is active and ready."""
        pass


class StdioTransport(MCPTransport):
    """
    Offline local process transport communicating over stdin/stdout.
    Strictly local, isolated, and offline.
    """

    def __init__(
        self,
        command: List[str],
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        startup_timeout: float = 10.0,
    ):
        self.command = command
        self.cwd = cwd
        self.env = env
        self.startup_timeout = startup_timeout
        self._process: Optional[subprocess.Popen] = None
        self._rx_queue: queue.Queue = queue.Queue()
        self._reader_thread: Optional[threading.Thread] = None
        self._running = False

    def connect(self) -> None:
        """Launch local MCP server process."""
        if self.is_connected:
            return

        process_env = os.environ.copy()
        if self.env:
            process_env.update(self.env)

        self._process = subprocess.Popen(
            self.command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.cwd,
            env=process_env,
            text=True,
            bufsize=1,
            encoding="utf-8",
        )

        self._running = True
        self._reader_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._reader_thread.start()

    def _read_stdout(self) -> None:
        """Background worker reading newline-delimited lines from process stdout."""
        while self._running and self._process and self._process.stdout:
            try:
                line = self._process.stdout.readline()
                if not line:
                    break
                self._rx_queue.put(line.strip())
            except Exception:
                break
        self._running = False

    def send(self, message: str) -> None:
        """Send newline-delimited JSON string to process stdin."""
        if not self.is_connected or not self._process or not self._process.stdin:
            raise ConnectionError("StdioTransport is not connected or process has terminated.")

        raw_line = message.strip() + "\n"
        self._process.stdin.write(raw_line)
        self._process.stdin.flush()

    def receive(self, timeout: Optional[float] = None) -> str:
        """Wait for and retrieve next line from process stdout."""
        try:
            return self._rx_queue.get(timeout=timeout)
        except queue.Empty:
            raise TimeoutError(f"Timed out waiting for MCP server response after {timeout}s.")

    def close(self) -> None:
        """Terminate local process and join reader thread."""
        self._running = False
        if self._process:
            try:
                if self._process.stdin:
                    self._process.stdin.close()
                self._process.terminate()
                self._process.wait(timeout=2.0)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process = None

    @property
    def is_connected(self) -> bool:
        return self._running and self._process is not None and self._process.poll() is None


class InMemoryTransport(MCPTransport):
    """
    Deterministic in-memory transport for unit testing MCP servers without OS subprocesses.
    """

    def __init__(self, message_handler: Optional[Callable[[str], str]] = None):
        self._handler = message_handler
        self._rx_queue: queue.Queue = queue.Queue()
        self._connected = False

    def set_handler(self, handler: Callable[[str], str]) -> None:
        self._handler = handler

    def connect(self) -> None:
        self._connected = True

    def send(self, message: str) -> None:
        if not self._connected:
            raise ConnectionError("InMemoryTransport is not connected.")
        if self._handler:
            resp = self._handler(message)
            if resp:
                self._rx_queue.put(resp)

    def receive(self, timeout: Optional[float] = None) -> str:
        try:
            return self._rx_queue.get(timeout=timeout)
        except queue.Empty:
            raise TimeoutError("Timed out waiting for in-memory response.")

    def close(self) -> None:
        self._connected = False
        while not self._rx_queue.empty():
            try:
                self._rx_queue.get_nowait()
            except queue.Empty:
                break

    @property
    def is_connected(self) -> bool:
        return self._connected
