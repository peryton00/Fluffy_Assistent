/**
 * Fluffy Desktop - Memory Workspace
 * 
 * Domain workspace for session context, long-term user profile,
 * system preferences, and knowledge base.
 */

import React from "react";
import { useUIStore } from "../../stores/uiStore";
import { MemoryHeader } from "./components/MemoryHeader";
import { MemoryOverview } from "./views/MemoryOverview";
import { SessionsView } from "./views/SessionsView";
import { LongTermProfileView } from "./views/LongTermProfileView";
import { PreferencesView } from "./views/PreferencesView";
import { KnowledgeView } from "./views/KnowledgeView";

export const MemoryWorkspace: React.FC = () => {
  const { memorySection } = useUIStore();

  const renderContent = () => {
    switch (memorySection) {
      case "overview":
        return <MemoryOverview />;
      case "sessions":
        return <SessionsView />;
      case "profile":
        return <LongTermProfileView />;
      case "preferences":
        return <PreferencesView />;
      case "knowledge":
        return <KnowledgeView />;
      default:
        return <MemoryOverview />;
    }
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-5)",
        }}
      >
        <MemoryHeader />
        {renderContent()}
      </div>
    </div>
  );
};
