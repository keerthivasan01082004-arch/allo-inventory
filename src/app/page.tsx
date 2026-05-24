// src/app/page.tsx
// Root page — redirects to the product listing.

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/products");
}
