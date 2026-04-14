import { themeQuartz, type Theme } from 'ag-grid-community';

const lightTheme: Theme = themeQuartz.withParams({
  backgroundColor: 'hsl(0 0% 100%)',
  foregroundColor: 'hsl(0 0% 9%)',
  headerBackgroundColor: 'hsl(0 0% 98%)',
  headerTextColor: 'hsl(0 0% 45%)',
  borderColor: 'hsl(0 0% 91%)',
  rowHoverColor: 'hsl(0 0% 95%)',
  selectedRowBackgroundColor: 'hsl(0 0% 93%)',
  oddRowBackgroundColor: 'hsl(0 0% 100%)',
  cellTextColor: 'hsl(0 0% 9%)',
  chromeBackgroundColor: 'hsl(0 0% 98%)',
  fontFamily: 'inherit',
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 500,
});

const darkTheme: Theme = themeQuartz.withParams({
  backgroundColor: 'hsl(228 14% 12%)',
  foregroundColor: 'hsl(220 13% 91%)',
  headerBackgroundColor: 'hsl(228 14% 10%)',
  headerTextColor: 'hsl(220 10% 52%)',
  borderColor: 'hsl(228 12% 18%)',
  rowHoverColor: 'hsl(228 12% 16%)',
  selectedRowBackgroundColor: 'hsl(228 12% 18%)',
  oddRowBackgroundColor: 'hsl(228 14% 12%)',
  cellTextColor: 'hsl(220 13% 91%)',
  chromeBackgroundColor: 'hsl(228 14% 10%)',
  fontFamily: 'inherit',
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 500,
});

export function getGridTheme(resolved: 'light' | 'dark'): Theme {
  return resolved === 'dark' ? darkTheme : lightTheme;
}
