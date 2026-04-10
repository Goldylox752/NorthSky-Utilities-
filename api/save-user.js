let users = [];

export default function handler(req, res) {
  const { email } = req.body;

  users.push({ email, paid: true });

  res.json({ success: true });
}

import { supabase } from "../lib/supabase";

export default async function handler(req, res) {
  const { email, site, result } = req.body;

  await supabase.from("reports").insert([
    { email, site, result }
  ]);

  res.json({ success: true });
}