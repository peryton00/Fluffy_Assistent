/**
 * Fluffy Desktop - Terminal Feature Types
 */

import type { TerminalOutputColorTag } from "../../types/contracts";

export interface TerminalOutputLineItem {
  id: string;
  tag: string;
  text: string;
  color_tag: TerminalOutputColorTag;
  timestamp: string;
}

export interface TerminalFilterOptions {
  searchQuery: string;
  filterTag: string;
}
