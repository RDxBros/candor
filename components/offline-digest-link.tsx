"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function OfflineDigestLink() {
  const [href, setHref] = useState("/");
  useEffect(() => setHref(localStorage.getItem("candor:last-digest-url") || "/"), []);
  return <Link className="primary-button inline-button" href={href}>Open last digest</Link>;
}
