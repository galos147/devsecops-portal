"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PackagesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/images"); }, [router]);
  return null;
}
