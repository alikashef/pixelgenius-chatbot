import { redirect } from "next/navigation";

// Proposal is now handled via chat phone collection flow → /login → /panel
export default function ProposalPage() {
  redirect("/panel");
}
