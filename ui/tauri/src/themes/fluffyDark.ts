export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
}

export const fluffyDarkTheme: ThemeDefinition = {
  id: "fluffyDark",
  name: "Fluffy Dark",
  description: "Standard high-density dark operational theme",
  isDark: true,
};
