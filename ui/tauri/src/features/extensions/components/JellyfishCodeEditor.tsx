/**
 * Fluffy Desktop - Jellyfish Code Editor
 * 
 * High-performance, lightweight code editor with VS Code Jellyfish syntax highlighting,
 * synchronized independent scrolling, line numbering, Tab insertion, and smart indentation.
 */

import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";

interface JellyfishCodeEditorProps {
  value: string;
  onChange: (val: string) => void;
  language?: string;
  readOnly?: boolean;
  placeholder?: string;
  isDirty?: boolean;
  lastSavedTime?: string | null;
  onSave?: () => void;
  onRunTest?: () => void;
}

// ── Jellyfish Theme Palette ──────────────────────────────────────────────────
const JELLYFISH_THEME = {
  bg: "#131721",
  gutterBg: "#0f121a",
  gutterBorder: "rgba(255, 255, 255, 0.07)",
  gutterText: "#4c566a",
  gutterActiveText: "#c8d3f5",
  text: "#d8e2ff",
  keyword: "#ff757f",        // def, class, return, if, else, import, etc.
  builtinType: "#2dd4bf",    // self, cls, str, int, list, dict, Any, Dict, etc.
  constant: "#ff966c",       // True, False, None
  string: "#c3e88d",         // strings & docstrings
  number: "#ff9e64",         // numbers & hex
  fnName: "#82aaff",         // function definitions & calls
  className: "#ffcb6b",      // class definitions
  decorator: "#c792ea",      // @decorator
  comment: "#676e95",        // # comments
  operator: "#89ddff",       // +, -, =, ==, ->, etc.
  punctuation: "#9ab0d5",    // (, ), [, ], {, }, :, ,
  cursor: "#82aaff",
  selection: "rgba(130, 170, 255, 0.25)",
};

interface TokenSpan {
  text: string;
  color: string;
  italic?: boolean;
  bold?: boolean;
}

/**
 * Tokenize Python code into styled spans with multi-line string support.
 */
function tokenizePython(code: string): TokenSpan[][] {
  const lines = code.split("\n");
  const result: TokenSpan[][] = [];

  let inTripleDouble = false;
  let inTripleSingle = false;

  const KEYWORDS = new Set([
    "def", "class", "import", "from", "return", "if", "elif", "else", "try",
    "except", "finally", "for", "while", "in", "is", "and", "or", "not",
    "as", "with", "raise", "yield", "pass", "break", "continue", "lambda",
    "async", "await", "assert", "del", "global", "nonlocal"
  ]);

  const CONSTANTS = new Set(["True", "False", "None"]);

  const BUILTIN_TYPES = new Set([
    "self", "cls", "int", "str", "float", "bool", "list", "dict", "set",
    "tuple", "bytes", "bytearray", "object", "type", "Any", "Dict", "List",
    "Optional", "Union", "Tuple", "Set", "Callable", "Sequence", "Iterable",
    "Exception", "RuntimeError", "ValueError", "TypeError", "KeyError",
    "FileNotFoundError", "TimeoutExpired", "print", "len", "range", "enumerate",
    "isinstance", "issubclass", "zip", "min", "max", "sum", "open", "super",
    "hasattr", "getattr", "setattr"
  ]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens: TokenSpan[] = [];
    let idx = 0;

    // Handle multiline string continuations
    if (inTripleDouble) {
      const endIdx = line.indexOf('"""');
      if (endIdx !== -1) {
        lineTokens.push({ text: line.slice(0, endIdx + 3), color: JELLYFISH_THEME.string });
        idx = endIdx + 3;
        inTripleDouble = false;
      } else {
        lineTokens.push({ text: line, color: JELLYFISH_THEME.string });
        result.push(lineTokens);
        continue;
      }
    } else if (inTripleSingle) {
      const endIdx = line.indexOf("'''");
      if (endIdx !== -1) {
        lineTokens.push({ text: line.slice(0, endIdx + 3), color: JELLYFISH_THEME.string });
        idx = endIdx + 3;
        inTripleSingle = false;
      } else {
        lineTokens.push({ text: line, color: JELLYFISH_THEME.string });
        result.push(lineTokens);
        continue;
      }
    }

    while (idx < line.length) {
      const remaining = line.slice(idx);

      // 1. Whitespace
      const wsMatch = remaining.match(/^[ \t]+/);
      if (wsMatch) {
        lineTokens.push({ text: wsMatch[0], color: JELLYFISH_THEME.text });
        idx += wsMatch[0].length;
        continue;
      }

      // 2. Triple double quotes
      if (remaining.startsWith('"""')) {
        const endIdx = remaining.indexOf('"""', 3);
        if (endIdx !== -1) {
          const str = remaining.slice(0, endIdx + 3);
          lineTokens.push({ text: str, color: JELLYFISH_THEME.string });
          idx += str.length;
        } else {
          lineTokens.push({ text: remaining, color: JELLYFISH_THEME.string });
          inTripleDouble = true;
          idx = line.length;
        }
        continue;
      }

      // 3. Triple single quotes
      if (remaining.startsWith("'''")) {
        const endIdx = remaining.indexOf("'''", 3);
        if (endIdx !== -1) {
          const str = remaining.slice(0, endIdx + 3);
          lineTokens.push({ text: str, color: JELLYFISH_THEME.string });
          idx += str.length;
        } else {
          lineTokens.push({ text: remaining, color: JELLYFISH_THEME.string });
          inTripleSingle = true;
          idx = line.length;
        }
        continue;
      }

      // 4. Comments
      if (remaining.startsWith("#")) {
        lineTokens.push({ text: remaining, color: JELLYFISH_THEME.comment, italic: true });
        idx = line.length;
        continue;
      }

      // 5. Decorators (@decorator)
      const decMatch = remaining.match(/^@[A-Za-z_][A-Za-z0-9_.]*/);
      if (decMatch) {
        lineTokens.push({ text: decMatch[0], color: JELLYFISH_THEME.decorator });
        idx += decMatch[0].length;
        continue;
      }

      // 6. Single-line strings (supports f"", r"", b"", etc.)
      const strMatch = remaining.match(/^[frbFRB]?("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/);
      if (strMatch) {
        lineTokens.push({ text: strMatch[0], color: JELLYFISH_THEME.string });
        idx += strMatch[0].length;
        continue;
      }

      // 7. Numbers (hex, float, int)
      const numMatch = remaining.match(/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)/);
      if (numMatch) {
        lineTokens.push({ text: numMatch[0], color: JELLYFISH_THEME.number });
        idx += numMatch[0].length;
        continue;
      }

      // 8. Class / Def identifiers
      const classDecl = remaining.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (classDecl) {
        lineTokens.push({ text: "class", color: JELLYFISH_THEME.keyword, bold: true });
        const space = remaining.slice(5, remaining.indexOf(classDecl[1]));
        lineTokens.push({ text: space, color: JELLYFISH_THEME.text });
        lineTokens.push({ text: classDecl[1], color: JELLYFISH_THEME.className, bold: true });
        idx += 5 + space.length + classDecl[1].length;
        continue;
      }

      const defDecl = remaining.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (defDecl) {
        lineTokens.push({ text: "def", color: JELLYFISH_THEME.keyword, bold: true });
        const space = remaining.slice(3, remaining.indexOf(defDecl[1]));
        lineTokens.push({ text: space, color: JELLYFISH_THEME.text });
        lineTokens.push({ text: defDecl[1], color: JELLYFISH_THEME.fnName, bold: true });
        idx += 3 + space.length + defDecl[1].length;
        continue;
      }

      // 9. Identifiers / Words / Calls
      const wordMatch = remaining.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (wordMatch) {
        const word = wordMatch[0];
        const nextChar = line[idx + word.length];

        if (KEYWORDS.has(word)) {
          lineTokens.push({ text: word, color: JELLYFISH_THEME.keyword, bold: true });
        } else if (CONSTANTS.has(word)) {
          lineTokens.push({ text: word, color: JELLYFISH_THEME.constant, bold: true });
        } else if (BUILTIN_TYPES.has(word)) {
          lineTokens.push({ text: word, color: JELLYFISH_THEME.builtinType });
        } else if (nextChar === "(") {
          // Function call
          lineTokens.push({ text: word, color: JELLYFISH_THEME.fnName });
        } else {
          lineTokens.push({ text: word, color: JELLYFISH_THEME.text });
        }
        idx += word.length;
        continue;
      }

      // 10. Multi-character operators
      const multiOp = remaining.match(/^(?:->|==|!=|<=|>=|\+=|-=|\*=|\/=|&&|\|\||\/\/|\*\*)/);
      if (multiOp) {
        lineTokens.push({ text: multiOp[0], color: JELLYFISH_THEME.operator, bold: true });
        idx += multiOp[0].length;
        continue;
      }

      // 11. Single operators & punctuation
      const char = remaining[0];
      if ("=+-*/%<>!&|^~".includes(char)) {
        lineTokens.push({ text: char, color: JELLYFISH_THEME.operator });
      } else if ("()[]{}:;,.".includes(char)) {
        lineTokens.push({ text: char, color: JELLYFISH_THEME.punctuation });
      } else {
        lineTokens.push({ text: char, color: JELLYFISH_THEME.text });
      }
      idx += 1;
    }

    result.push(lineTokens);
  }

  return result;
}

export const JellyfishCodeEditor: React.FC<JellyfishCodeEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  placeholder = "# Enter extension python code...",
  isDirty = false,
  lastSavedTime = null,
  onSave,
  onRunTest,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const linesContainerRef = useRef<HTMLDivElement>(null);

  const [wordWrap, setWordWrap] = useState<boolean>(true);
  const [lineHeights, setLineHeights] = useState<number[]>([]);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const tokenizedLines = useMemo(() => tokenizePython(value || ""), [value]);
  const lineCount = Math.max(tokenizedLines.length, 1);

  // Sync Line Number heights dynamically when Word Wrap is active
  const updateLineHeights = useCallback(() => {
    if (!linesContainerRef.current) return;
    const children = linesContainerRef.current.children;
    const heights: number[] = [];
    for (let i = 0; i < children.length; i++) {
      heights.push((children[i] as HTMLElement).offsetHeight || 22);
    }
    setLineHeights(heights);
  }, []);

  useEffect(() => {
    updateLineHeights();
  }, [value, wordWrap, tokenizedLines, updateLineHeights]);

  // Recalculate line heights on window / editor resize
  useEffect(() => {
    if (!preRef.current) return;
    const observer = new ResizeObserver(() => {
      updateLineHeights();
    });
    observer.observe(preRef.current);
    return () => observer.disconnect();
  }, [updateLineHeights]);

  // Sync scroll positions between Textarea, Pre, and Gutter
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  // Track cursor position
  const updateCursorPos = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const textBefore = textareaRef.current.value.slice(0, pos);
    const lines = textBefore.split("\n");
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    });
  };

  // Keyboard enhancements matching VS Code
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // 1. Ctrl + S (or Cmd + S): Save & Hot-Reload
    if (isCmdOrCtrl && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      onSave?.();
      return;
    }

    // 2. Ctrl + Enter (or Cmd + Enter): Run test execution
    if (isCmdOrCtrl && e.key === "Enter") {
      e.preventDefault();
      onRunTest?.();
      return;
    }

    // 3. Alt + Z: Toggle Word Wrap
    if (e.altKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      setWordWrap((w) => !w);
      return;
    }

    if (readOnly) return;

    // 4. Ctrl + / (or Cmd + /): Toggle Comment on line(s)
    if (isCmdOrCtrl && e.key === "/") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = textarea.value;

      // Find start and end of affected lines
      const lineStart = current.lastIndexOf("\n", start - 1) + 1;
      let lineEnd = current.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = current.length;

      const affectedBlock = current.substring(lineStart, lineEnd);
      const affectedLines = affectedBlock.split("\n");

      // Check if all non-empty lines are commented
      const allCommented = affectedLines.every(
        (l) => l.trim().length === 0 || l.trimStart().startsWith("#")
      );

      const modifiedLines = affectedLines.map((line) => {
        if (allCommented) {
          // Remove comment
          return line.replace(/^([ \t]*)#\s?/, "$1");
        } else {
          // Add comment
          if (line.trim().length === 0) return line;
          const match = line.match(/^([ \t]*)/);
          const ws = match ? match[1] : "";
          return `${ws}# ${line.substring(ws.length)}`;
        }
      });

      const replacement = modifiedLines.join("\n");
      const updated = current.substring(0, lineStart) + replacement + current.substring(lineEnd);
      onChange(updated);

      requestAnimationFrame(() => {
        textarea.selectionStart = lineStart;
        textarea.selectionEnd = lineStart + replacement.length;
        updateCursorPos();
      });
      return;
    }

    // 5. Tab / Shift + Tab Indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = textarea.value;

      if (e.shiftKey) {
        // Shift + Tab: Outdent
        const lineStart = current.lastIndexOf("\n", start - 1) + 1;
        let lineEnd = current.indexOf("\n", end);
        if (lineEnd === -1) lineEnd = current.length;

        const affectedBlock = current.substring(lineStart, lineEnd);
        const affectedLines = affectedBlock.split("\n");
        const modifiedLines = affectedLines.map((line) => line.replace(/^( {1,4}|\t)/, ""));

        const replacement = modifiedLines.join("\n");
        const updated = current.substring(0, lineStart) + replacement + current.substring(lineEnd);
        onChange(updated);

        requestAnimationFrame(() => {
          textarea.selectionStart = lineStart;
          textarea.selectionEnd = lineStart + replacement.length;
          updateCursorPos();
        });
      } else if (start !== end) {
        // Tab with multi-line selection: Indent all selected lines
        const lineStart = current.lastIndexOf("\n", start - 1) + 1;
        let lineEnd = current.indexOf("\n", end);
        if (lineEnd === -1) lineEnd = current.length;

        const affectedBlock = current.substring(lineStart, lineEnd);
        const affectedLines = affectedBlock.split("\n");
        const modifiedLines = affectedLines.map((line) => "    " + line);

        const replacement = modifiedLines.join("\n");
        const updated = current.substring(0, lineStart) + replacement + current.substring(lineEnd);
        onChange(updated);

        requestAnimationFrame(() => {
          textarea.selectionStart = lineStart;
          textarea.selectionEnd = lineStart + replacement.length;
          updateCursorPos();
        });
      } else {
        // Single cursor Tab: Insert 4 spaces
        const updated = current.substring(0, start) + "    " + current.substring(end);
        onChange(updated);

        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 4;
          updateCursorPos();
        });
      }
      return;
    }

    // 6. Enter key with Smart Indentation
    if (e.key === "Enter") {
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const current = textarea.value;

      // Find current line indent
      const lineStart = current.lastIndexOf("\n", start - 1) + 1;
      const lineText = current.substring(lineStart, start);
      const indentMatch = lineText.match(/^[ ]+/);
      let indent = indentMatch ? indentMatch[0] : "";

      // If line ends with colon, increase indent
      if (lineText.trimEnd().endsWith(":")) {
        indent += "    ";
      }

      if (indent.length > 0) {
        e.preventDefault();
        const updated = current.substring(0, start) + "\n" + indent + current.substring(start);
        onChange(updated);

        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1 + indent.length;
          updateCursorPos();
        });
      }
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        backgroundColor: JELLYFISH_THEME.bg,
        color: JELLYFISH_THEME.text,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Editor Main Canvas */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Line Numbers Gutter */}
        <div
          ref={gutterRef}
          style={{
            width: "3.5rem",
            flexShrink: 0,
            padding: "14px 8px 14px 0",
            textAlign: "right",
            userSelect: "none",
            backgroundColor: JELLYFISH_THEME.gutterBg,
            borderRight: `1px solid ${JELLYFISH_THEME.gutterBorder}`,
            color: JELLYFISH_THEME.gutterText,
            fontFamily: "var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace)",
            fontSize: "12px",
            lineHeight: "22px",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => {
            const lineNum = i + 1;
            const isActive = lineNum === cursorPos.line;
            const heightStyle = wordWrap && lineHeights[i] ? `${lineHeights[i]}px` : "22px";
            return (
              <div
                key={lineNum}
                style={{
                  height: heightStyle,
                  minHeight: "22px",
                  color: isActive ? JELLYFISH_THEME.gutterActiveText : JELLYFISH_THEME.gutterText,
                  fontWeight: isActive ? 600 : 400,
                  opacity: isActive ? 1 : 0.6,
                  boxSizing: "border-box",
                }}
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        {/* Code Surface Container (Independent Scroll) */}
        <div
          style={{
            flex: 1,
            position: "relative",
            height: "100%",
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            backgroundColor: JELLYFISH_THEME.bg,
          }}
        >
          {/* Syntax Highlighted PRE Layer */}
          <pre
            ref={preRef}
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              margin: 0,
              padding: "14px 16px",
              fontFamily: "var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace)",
              fontSize: "12px",
              lineHeight: "22px",
              whiteSpace: wordWrap ? "pre-wrap" : "pre",
              wordBreak: wordWrap ? "break-word" : "normal",
              overflowWrap: wordWrap ? "break-word" : "normal",
              tabSize: 4,
              overflow: "hidden",
              pointerEvents: "none",
              boxSizing: "border-box",
            }}
          >
            <code ref={linesContainerRef} style={{ display: "block" }}>
              {tokenizedLines.map((lineTokens, lIdx) => (
                <div
                  key={lIdx}
                  style={{
                    minHeight: "22px",
                    lineHeight: "22px",
                    wordBreak: wordWrap ? "break-word" : "normal",
                    overflowWrap: wordWrap ? "break-word" : "normal",
                  }}
                >
                  {lineTokens.length === 0 ? (
                    <span>{" "}</span>
                  ) : (
                    lineTokens.map((tok, tIdx) => (
                      <span
                        key={tIdx}
                        style={{
                          color: tok.color,
                          fontStyle: tok.italic ? "italic" : "normal",
                          fontWeight: tok.bold ? 600 : 400,
                        }}
                      >
                        {tok.text}
                      </span>
                    ))
                  )}
                </div>
              ))}
            </code>
          </pre>

          {/* Interactive Transparent Textarea Overlay */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onClick={updateCursorPos}
            onKeyUp={updateCursorPos}
            onKeyDown={handleKeyDown}
            readOnly={readOnly}
            spellCheck={false}
            placeholder={placeholder}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              margin: 0,
              padding: "14px 16px",
              fontFamily: "var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace)",
              fontSize: "12px",
              lineHeight: "22px",
              whiteSpace: wordWrap ? "pre-wrap" : "pre",
              wordBreak: wordWrap ? "break-word" : "normal",
              overflowWrap: wordWrap ? "break-word" : "normal",
              tabSize: 4,
              color: "transparent",
              caretColor: JELLYFISH_THEME.cursor,
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              overflowX: wordWrap ? "hidden" : "auto",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Editor Status Bar */}
      <footer
        style={{
          padding: "4px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "10.5px",
          fontFamily: "var(--font-mono, monospace)",
          backgroundColor: JELLYFISH_THEME.gutterBg,
          borderTop: `1px solid ${JELLYFISH_THEME.gutterBorder}`,
          color: "rgba(200, 211, 245, 0.7)",
          userSelect: "none",
        }}
      >
        {/* Left: Language, Encoding, Indent, Word Wrap */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: 500, color: "var(--color-accent, #82aaff)" }}>Python</span>
          <span>UTF-8</span>
          <span>Spaces: 4</span>
          <button
            type="button"
            onClick={() => setWordWrap(!wordWrap)}
            title="Toggle Word Wrap (Alt+Z)"
            style={{
              background: wordWrap ? "rgba(130, 170, 255, 0.15)" : "transparent",
              color: wordWrap ? "#82aaff" : "rgba(200, 211, 245, 0.5)",
              border: `1px solid ${wordWrap ? "rgba(130, 170, 255, 0.3)" : "transparent"}`,
              borderRadius: "3px",
              padding: "1px 6px",
              fontSize: "10px",
              cursor: "pointer",
            }}
          >
            Wrap: {wordWrap ? "ON" : "OFF"} (Alt+Z)
          </button>
        </div>

        {/* Center: Real-time Dirty / Saved indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isDirty ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                color: "#ff9e64",
                fontWeight: 600,
                backgroundColor: "rgba(255, 158, 100, 0.12)",
                padding: "2px 8px",
                borderRadius: "3px",
                border: "1px solid rgba(255, 158, 100, 0.25)",
              }}
              title="Changes not yet saved. Press Ctrl+S to save & hot-reload."
            >
              ● Unsaved (Ctrl+S)
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                color: "#c3e88d",
                fontWeight: 500,
              }}
              title="All changes saved and active in runtime"
            >
              ✓ Saved {lastSavedTime ? `at ${lastSavedTime}` : ""}
            </span>
          )}
        </div>

        {/* Right: Position & Length */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>{lineCount} lines</span>
          <span>{value.length} chars</span>
        </div>
      </footer>
    </div>
  );
};
