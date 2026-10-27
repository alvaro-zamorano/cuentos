/**
 * Cuánto valen las URL firmadas de las imágenes de la vista del libro (I20). Lo comparten el servidor, que las da con al
 * menos esta vida, y el navegador, que reutiliza la primera URL de cada imagen un rato menos. Sin dependencias: lo
 * importan los dos lados.
 */
export const VIEW_URL_SECONDS = 3600;
/** El navegador reutiliza una URL como mucho tres cuartos de su vida: le queda margen para cargar. */
export const VIEW_URL_REUSE_MS = VIEW_URL_SECONDS * 750;
