// Save text to a file the user chooses. Where supported (Chrome/Edge), opens a
// native "Save As" dialog via the File System Access API so the user picks the
// folder + filename. Falls back to the classic anchor download elsewhere.

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

type FileSystemWritable = { write: (data: string) => Promise<void>; close: () => Promise<void> };
type FileSystemFileHandle = { createWritable: () => Promise<FileSystemWritable> };

function getShowSaveFilePicker():
  | ((opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>)
  | undefined {
  return (window as unknown as {
    showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }).showSaveFilePicker;
}

function anchorDownload(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Save `text` to a file. Prompts the user for a location when the browser
 * supports it; otherwise triggers a normal download. A user-cancelled dialog
 * is a no-op.
 */
export async function saveTextFile(filename: string, text: string, mime = "text/plain"): Promise<void> {
  const showSaveFilePicker = getShowSaveFilePicker();
  if (showSaveFilePicker) {
    try {
      const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
      const handle = await showSaveFilePicker({
        suggestedName: filename,
        types: ext ? [{ description: "Export", accept: { [mime]: [ext] } }] : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled the picker — nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Anything else (e.g. permission/security error): fall back to download.
    }
  }
  anchorDownload(filename, text, mime);
}
