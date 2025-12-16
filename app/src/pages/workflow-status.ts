import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../lib/supabase-client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { executionId } = req.query;

  if (!executionId) {
    return res.status(400).json({ error: "executionId is required" });
  }

  const { data, error } = await supabase
    .from("workflow_executions")
    .select("*")
    .eq("id", executionId)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json(data);
}
