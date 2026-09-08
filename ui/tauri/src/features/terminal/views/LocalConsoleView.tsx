/**
 * Fluffy Desktop - Local Console View
 * 
 * Interactive terminal REPL workspace.
 * Features live streaming viewport, output filtering, and keyboard-first command input.
 */

import React, { useState } from "react";
import { TerminalToolbar } from "../components/TerminalToolbar";
import { TerminalViewport } from "../components/TerminalViewport";
import { TerminalInput } from "../components/TerminalInput";
import { uiStore } from "../../../stores/uiStore";

export const LocalConsoleView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>("");

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        backgroundColor: "var(--color-bg)",
        overflow: "hidden",
      }}
    >
      {/* Output Search Filter */}
      <TerminalToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Output Lines Viewport */}
      <TerminalViewport
        filterQuery={searchQuery}
        onSelectLine={(line) =>
          uiStore.setInspectorItem({
            id: line.id,
            type: "log",
            title: `Terminal Output: ${line.tag}`,
            data: line as unknown as Record<string, unknown>,
          })
        }
      />

      {/* Command Input Prompt */}
      <TerminalInput />
    </div>
  );
};
