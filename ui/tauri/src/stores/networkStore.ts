/**
 * Fluffy Desktop - Network / LAN Distributed Nodes Store
 * 
 * Manages peer-to-peer LAN node discovery, network roles, active machine switching,
 * remote machine telemetry inspection, and controlled 5-second polling when active.
 */

import { useSyncExternalStore } from "react";
import {
  getNetworkRole,
  setNetworkRole,
  getAdminMachines,
  switchAdminMachine,
  getAdminMachineData,
  sendAdminMachineAction,
  addAdminMachine,
  removeAdminMachine,
} from "../services/api/systems";
import type { NetworkRole, NetworkMachine, RemoteMachineData } from "../types/contracts";

export interface NetworkState {
  role: NetworkRole;
  machines: NetworkMachine[];
  activeMachineId: string | null;
  activeMachineData: RemoteMachineData | null;
  loading: boolean;
  isPolling: boolean;
  error: Error | null;
  lastPolled: number | null;
}

const NETWORK_POLL_INTERVAL_MS = 5000;

class NetworkStoreManager {
  private state: NetworkState = {
    role: "standalone",
    machines: [],
    activeMachineId: null,
    activeMachineData: null,
    loading: false,
    isPolling: false,
    error: null,
    lastPolled: null,
  };

  private listeners = new Set<() => void>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isExecutingPoll = false;

  public getState(): NetworkState {
    return this.state;
  }

  private setState(partial: Partial<NetworkState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public startPolling = (): void => {
    if (this.state.isPolling) {
      return;
    }
    this.setState({ isPolling: true });
    this.scheduleNext(0);
  };

  public stopPolling = (): void => {
    if (!this.state.isPolling) {
      return;
    }
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.setState({ isPolling: false });
  };

  public refreshNow = async (): Promise<void> => {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    await this.pollOnce();
    if (this.state.isPolling) {
      this.scheduleNext();
    }
  };

  private scheduleNext(delayMs?: number): void {
    if (!this.state.isPolling) {
      return;
    }
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    const interval = delayMs !== undefined ? delayMs : NETWORK_POLL_INTERVAL_MS;
    this.timerId = setTimeout(() => {
      this.pollOnce().finally(() => {
        if (this.state.isPolling) {
          this.scheduleNext();
        }
      });
    }, interval);
  }

  private async pollOnce(): Promise<void> {
    if (this.isExecutingPoll) {
      return;
    }
    this.isExecutingPoll = true;

    try {
      // 1. Fetch current role
      const roleRes = await getNetworkRole().catch(() => ({ ok: false, role: this.state.role }));
      const role = roleRes.ok ? roleRes.role : this.state.role;

      // 2. If role is admin or available, fetch machine list
      let machines: NetworkMachine[] = [];
      let activeMachineId = this.state.activeMachineId;

      if (role === "admin") {
        const machinesRes = await getAdminMachines().catch(() => ({ ok: false, machines: [] as NetworkMachine[], active_machine: undefined }));
        if (machinesRes.ok) {
          machines = machinesRes.machines;
          if (machinesRes.active_machine !== undefined) {
            activeMachineId = machinesRes.active_machine;
          }
        }
      }

      // 3. If there is an active remote machine selected, fetch its data
      let activeMachineData = this.state.activeMachineData;
      if (activeMachineId && role === "admin") {
        const dataRes = await getAdminMachineData(activeMachineId).catch(() => ({ ok: false, data: {} }));
        if (dataRes.ok) {
          activeMachineData = dataRes.data;
        }
      }

      this.setState({
        role,
        machines,
        activeMachineId,
        activeMachineData,
        loading: false,
        error: null,
        lastPolled: Date.now(),
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    } finally {
      this.isExecutingPoll = false;
    }
  }

  public changeRole = async (role: NetworkRole): Promise<void> => {
    this.setState({ loading: true, error: null });
    try {
      await setNetworkRole(role);
      this.setState({ role, loading: false });
      await this.refreshNow();
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  public switchTarget = async (machineId: string): Promise<void> => {
    try {
      await switchAdminMachine(machineId);
      this.setState({ activeMachineId: machineId });
      await this.refreshNow();
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  public addNode = async (ip: string, port: number = 9000, name?: string): Promise<void> => {
    await addAdminMachine(ip, port, name);
    await this.refreshNow();
  };

  public removeNode = async (machineId: string): Promise<void> => {
    await removeAdminMachine(machineId);
    await this.refreshNow();
  };

  public sendAction = async (machineId: string, action: string, payload?: Record<string, unknown>): Promise<{ ok: boolean; result?: string }> => {
    return sendAdminMachineAction(machineId, action, payload);
  };
}

export const networkStore = new NetworkStoreManager();

/**
 * React hook for consuming Network state.
 */
export function useNetworkStore<T = NetworkState>(
  selector: (state: NetworkState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(networkStore.getState());
  return useSyncExternalStore(networkStore.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
