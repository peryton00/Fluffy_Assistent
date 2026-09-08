/**
 * Fluffy Desktop - Guardian Workspace
 *
 * Domain workspace for security, policy enforcement, approval management,
 * trusted whitelists, and audit history.
 */

import React from "react";
import { useUIStore } from "../../stores/uiStore";
import { GuardianHeader } from "./components/GuardianHeader";
import { GuardianOverview } from "./views/GuardianOverview";
import { GuardianAlertsView } from "./views/GuardianAlertsView";
import { PendingApprovalsView } from "./views/PendingApprovalsView";
import { TrustedProcessesView } from "./views/TrustedProcessesView";
import { GuardianHistoryView } from "./views/GuardianHistoryView";

export const GuardianWorkspace: React.FC = () => {
  const { guardianSection } = useUIStore();

  const renderContent = () => {
    switch (guardianSection) {
      case "overview":
        return <GuardianOverview />;
      case "alerts":
        return <GuardianAlertsView />;
      case "approvals":
        return <PendingApprovalsView />;
      case "trusted":
        return <TrustedProcessesView />;
      case "history":
        return <GuardianHistoryView />;
      default:
        return <GuardianOverview />;
    }
  };

  return (
    <div
      style={{
        flex: "1 1 0%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: "auto",
        backgroundColor: "var(--color-bg)",
        padding: "var(--space-4) var(--space-6)",
      }}
    >
      <div style={{ maxWidth: "1280px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <GuardianHeader />
        {renderContent()}
      </div>
    </div>
  );
};
