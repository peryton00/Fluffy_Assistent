/**
 * Fluffy Desktop - Process Tree View Component
 * 
 * Organizes flat process telemetry into a hierarchical process tree
 * using parent_pid relationships without heavy graphical dependencies.
 */

import React, { useState } from "react";
import type { ProcessTelemetry } from "../../../types/contracts";
import { ProcessRow } from "./ProcessRow";

interface ProcessTreeProps {
  processes: ProcessTelemetry[];
  defaultExpanded?: boolean;
}

interface TreeNode {
  process: ProcessTelemetry;
  children: TreeNode[];
  totalRamMb: number;
  totalCpuPercent: number;
  totalDiskKb: number;
}

export const ProcessTree: React.FC<ProcessTreeProps> = ({ processes, defaultExpanded = false }) => {
  const [expandedPids, setExpandedPids] = useState<Set<number>>(() => {
    if (defaultExpanded) {
      return new Set(processes.map((p) => p.pid));
    }
    return new Set();
  });

  const toggleExpand = (pid: number) => {
    setExpandedPids((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });
  };

  // Build parent-child map and PID lookup
  const pidMap = new Map<number, ProcessTelemetry>();
  const childrenMap = new Map<number, ProcessTelemetry[]>();

  // Deduplicate processes by PID
  const uniqueProcesses: ProcessTelemetry[] = [];
  const seenPids = new Set<number>();

  processes.forEach((p) => {
    if (!seenPids.has(p.pid)) {
      seenPids.add(p.pid);
      uniqueProcesses.push(p);
      pidMap.set(p.pid, p);
    }
  });

  uniqueProcesses.forEach((p) => {
    const ppid = p.parent_pid || 0;
    // Disallow self-parenting to prevent infinite loops
    if (ppid !== p.pid) {
      const list = childrenMap.get(ppid);
      if (list) {
        list.push(p);
      } else {
        childrenMap.set(ppid, [p]);
      }
    }
  });

  // Track globally visited PIDs to prevent duplicate tree nodes and infinite cycles
  const globallyVisited = new Set<number>();

  const buildTree = (proc: ProcessTelemetry, currentPath = new Set<number>(), depth = 0): TreeNode => {
    globallyVisited.add(proc.pid);
    const newPath = new Set(currentPath);
    newPath.add(proc.pid);

    const selfDiskKb =
      (proc.disk_read_kb || 0) +
      (proc.disk_written_kb || 0) +
      ((proc.disk_usage_mb || 0) * 1024);

    if (depth >= 32) {
      return {
        process: proc,
        children: [],
        totalRamMb: proc.ram_mb || 0,
        totalCpuPercent: proc.cpu_percent || 0,
        totalDiskKb: selfDiskKb,
      };
    }

    const rawChildren = childrenMap.get(proc.pid) || [];
    // Only traverse children that are not in the current ancestry path and not yet visited globally
    const validChildren = rawChildren.filter(
      (c) => c.pid !== proc.pid && !newPath.has(c.pid) && !globallyVisited.has(c.pid)
    );

    const childNodes = validChildren.map((c) => buildTree(c, newPath, depth + 1));

    const totalRamMb = (proc.ram_mb || 0) + childNodes.reduce((acc, c) => acc + c.totalRamMb, 0);
    const totalCpuPercent = (proc.cpu_percent || 0) + childNodes.reduce((acc, c) => acc + c.totalCpuPercent, 0);
    const totalDiskKb = selfDiskKb + childNodes.reduce((acc, c) => acc + c.totalDiskKb, 0);

    return {
      process: proc,
      children: childNodes,
      totalRamMb,
      totalCpuPercent,
      totalDiskKb,
    };
  };

  // Identify roots: processes whose parent_pid is not in pidMap or is 0 or equals p.pid
  const roots: ProcessTelemetry[] = [];
  uniqueProcesses.forEach((p) => {
    if (!p.parent_pid || p.parent_pid === p.pid || !pidMap.has(p.parent_pid)) {
      roots.push(p);
    }
  });

  const tree: TreeNode[] = [];
  roots.forEach((root) => {
    if (!globallyVisited.has(root.pid)) {
      tree.push(buildTree(root));
    }
  });

  // Pick up any orphaned cycles or unvisited nodes so all processes appear in the view
  uniqueProcesses.forEach((p) => {
    if (!globallyVisited.has(p.pid)) {
      tree.push(buildTree(p));
    }
  });

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedPids.has(node.process.pid);

    return (
      <React.Fragment key={`tree-node-${node.process.pid}`}>
        <ProcessRow
          process={node.process}
          indent={depth}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          childCount={node.children.length}
          totalRamMb={hasChildren ? node.totalRamMb : undefined}
          totalCpuPercent={hasChildren ? node.totalCpuPercent : undefined}
          totalDiskKb={hasChildren ? node.totalDiskKb : undefined}
          onToggleExpand={() => toggleExpand(node.process.pid)}
        />
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <>
      {tree.map((root) => renderNode(root, 0))}
    </>
  );
};
