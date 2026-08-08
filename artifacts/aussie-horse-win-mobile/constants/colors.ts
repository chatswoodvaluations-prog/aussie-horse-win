/**
 * Design tokens derived from the Aussie Horse Win web app (index.css).
 * All values are dark-mode only — matching the web app's dark aesthetic.
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#F5F9FC',
    tint: '#00CC4A',

    // Core surfaces — deep navy / dark theme
    background: '#060D1F',
    foreground: '#F5F9FC',

    // Cards / elevated surfaces
    card: '#0A1227',
    cardForeground: '#F5F9FC',

    // Primary action — electric green
    primary: '#00CC4A',
    primaryForeground: '#003311',

    // Secondary surfaces
    secondary: '#1B2A40',
    secondaryForeground: '#F5F9FC',

    // Muted / subdued elements
    muted: '#131E2E',
    mutedForeground: '#8BA6C0',

    // Accent — same green
    accent: '#00CC4A',
    accentForeground: '#003311',

    // Destructive — red for losses / failures
    destructive: '#F24040',
    destructiveForeground: '#F5F9FC',

    // Borders and inputs
    border: '#1B2A40',
    input: '#1B2A40',

    // Custom semantic tokens
    pass: '#00E64D',
    fail: '#F24040',
    amber: '#FFA500',
  },

  // Border radius synced from web app's --radius: 0.25rem = 4px
  radius: 4,
};

// Dark theme matches light (app is dark-only, like the web app)
export default {
  ...colors,
  dark: colors.light,
};
