import socket
import json

COMMAND_HOST = "127.0.0.1"
COMMAND_PORT = 9002


def send_command(command: dict):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((COMMAND_HOST, COMMAND_PORT))
    s.sendall((json.dumps(command) + "\n").encode())
    s.close()
