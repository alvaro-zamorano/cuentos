"use client";

import { useLayoutEffect, useRef } from "react";

/** Textarea que crece con el texto (sin barra de desplazamiento): el padre ve la página entera mientras la edita. */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={2} {...props} style={{ ...props.style, overflow: "hidden" }} />;
}
