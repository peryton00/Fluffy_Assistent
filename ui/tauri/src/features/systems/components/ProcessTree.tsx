/**
 * Fluffy Desktop - Process Tree View Component
 * 
 * Organizes flat process telemetry into a hierarchical process tree
 * using parent_pid relationships without heavy graphical dependencies.
 */

import React from "react";
import type { ProcessTelemetry } from "../../../types/contracts";
import { ProcessRow } from "./ProcessRow";

interface ProcessTreeProps {
  processes: ProcessTelemetry[];
}

interface TreeNode {
  process: ProcessTelemetry;
  children: TreeNode[];
}

export const ProcessTree: React.FC<ProcessTreeProps> = ({ processes }) => {
  // Build parent-child map
  const pidMap = new Map<number, ProcessTelemetry>();
  const childrenMap = new Map<number, ProcessTelemetry[]>();

  processes.forEach((p) => {
    pidMap.set(p.pid, p);
    const ppid = p.parent_pid || 0;
    if (!childrenMap.has(ppid)) {
      childrenMap.set(ppid, []);
    }
    childrenMap.get(ppid)!.push(p);
  });

  // Identify roots: processes whose parent_pid is not in pidMap or is 0
  const roots: ProcessTelemetry[] = [];
  processes.forEach((p) => {
    if (!p.parent_pid || !pidMap.has(p.parent_pid)) {
      roots.push(p);
    }
  });

  const buildTree = (proc: ProcessTelemetry): TreeNode => {
    const children = childrenMap.get(proc.pid) || [];
    return {
      process: proc,
      children: children.map(buildTree),
    };
  };

  const tree = roots.map(buildTree);

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    return (
      <React.Fragment key={node.process.pid}>
        <ProcessRow process={node.process} indent={depth} />
        {node.children.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <>
      {tree.map((root) => renderNode(root, 0))}
    </>
  );
};
