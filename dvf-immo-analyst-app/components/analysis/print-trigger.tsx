"use client";
import { useEffect } from "react";

interface Props {
  skip?: boolean;
}

export function PrintTrigger({ skip }: Props) {
  useEffect(() => {
    if (skip) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [skip]);
  return null;
}
