/** Lưu Blob (VD PDF tải qua axios) thành tệp trên máy người dùng. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function contractPdfFilename(bookingId: string) {
  return `hop-dong-${bookingId.slice(0, 8).toUpperCase()}.pdf`;
}
