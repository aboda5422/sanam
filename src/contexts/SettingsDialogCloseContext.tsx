import { createContext, useContext } from "react";

/** Closes the open admin settings dialog after successful save/create. */
export const SettingsDialogCloseContext = createContext<(() => void) | null>(null);

export function useCloseSettingsDialog() {
  return useContext(SettingsDialogCloseContext);
}
