/**
 * Fluffy Desktop - Knowledge View
 * 
 * Knowledge Base view displaying learned domain topics, memory provenance,
 * and knowledge indexing status.
 */

import React, { useEffect } from "react";
import { useMemoryStore } from "../../../stores/memoryStore";
import { useUIStore } from "../../../stores/uiStore";
import {
  BookOpenIcon,
  CheckCircleIcon,
  RefreshIcon,
  InfoIcon,
} from "../../../components/common/Icons";

export const KnowledgeView: React.FC = () => {
  const memory = useMemoryStore();
  const { setInspectorItem } = useUIStore();

  useEffect(() => {
    memory.loadProfile();
  }, []);

  const facts = memory.profile?.facts || [];
  const learnedIntents = memory.profile?.learned_intents || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Knowledge Base Overview Banner */}
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "var(--space-2)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <div>
            <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0, display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><BookOpenIcon size={16} /></span>
              Knowledge &amp; Semantic Index
            </h3>
            <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Persistent knowledge items, user domain facts, and mapped intent associations.
            </p>
          </div>

          <button
            type="button"
            disabled={memory.loading}
            onClick={() => memory.loadProfile(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              fontSize: "11px",
              cursor: memory.loading ? "wait" : "pointer",
              opacity: memory.loading ? 0.6 : 1,
            }}
          >
            <RefreshIcon size={11} />
            <span>Sync Index</span>
          </button>
        </div>

        {/* Info notice about internal RAG/vector indexing */}
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--color-surface-elevated)",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border-subtle)",
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-2)",
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text)",
          }}
        >
          <span style={{ color: "var(--color-accent)", marginTop: "1px", display: "flex" }}><InfoIcon size={14} /></span>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>RAG Vector Store Integration:</span>
            <p style={{ margin: 0, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
              Domain facts and runtime memory items below are indexed for semantic retrieval by the Python Brain.
              Low-level vector embeddings and chunk partition management operate autonomously within the backend engine.
            </p>
          </div>
        </div>
      </div>

      {/* 2-Column: Knowledge Items / Facts & Learned Intent Associations */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {/* Learned Facts & Domain Knowledge */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "var(--space-2)",
              borderBottom: "1px solid var(--color-border-subtle)",
            }}
          >
            <div>
              <h4 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                Indexed Knowledge Items
              </h4>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                Fact nodes currently loaded into context memory.
              </p>
            </div>
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              {facts.length} items
            </span>
          </div>

          {facts.length === 0 ? (
            <div style={{ padding: "var(--space-6) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
              No knowledge items indexed yet. Add facts in Long-Term Profile.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: "380px", overflowY: "auto" }}>
              {facts.map((fact, idx) => (
                <div
                  key={idx}
                  onClick={() =>
                    setInspectorItem({
                      id: `ki-${idx}`,
                      type: "knowledgeItem",
                      title: `Knowledge Item #${idx + 1}`,
                      data: { index: idx, content: fact, provenance: "User Profile / Memory" },
                    })
                  }
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                    <span style={{ color: "var(--color-accent)", marginTop: "2px", display: "flex" }}><CheckCircleIcon size={12} /></span>
                    <span style={{ fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>{fact}</span>
                  </div>
                  <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", paddingLeft: "18px" }}>
                    Source: User Memory &bull; ID: #fact-{idx + 1}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Learned Intent Mappings */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "var(--space-2)",
              borderBottom: "1px solid var(--color-border-subtle)",
            }}
          >
            <div>
              <h4 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                Learned Intent Patterns
              </h4>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                Dynamic utterance-to-command mappings inferred by agent runtime.
              </p>
            </div>
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              {Object.keys(learnedIntents).length} patterns
            </span>
          </div>

          {Object.keys(learnedIntents).length === 0 ? (
            <div style={{ padding: "var(--space-6) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
              No custom intent patterns learned yet. Fluffy generates patterns dynamically during multi-turn interactions.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: "380px", overflowY: "auto" }}>
              {Object.entries(learnedIntents).map(([phrase, target]) => (
                <div
                  key={phrase}
                  onClick={() =>
                    setInspectorItem({
                      id: `intent-${phrase}`,
                      type: "knowledgeItem",
                      title: `Pattern: ${phrase}`,
                      data: { phrase, target, type: "intent_mapping" },
                    })
                  }
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>"{phrase}"</span>
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "1px 5px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                      Mapped
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                    &rarr; <code>{typeof target === "string" ? target : JSON.stringify(target)}</code>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
