import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, CalendarDays, Mail, MessageCircle, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { getIntegrationOverview } from "@/modules/inbox/integration-overview";

const categories = {
  email: { label: "Email", icon: Mail },
  messaging: { label: "Messaging", icon: Smartphone },
  chat: { label: "Live chat", icon: MessageCircle },
  calendar: { label: "Calendar", icon: CalendarDays },
  ai: { label: "AI", icon: Bot },
} as const;
const filters = [
  ["all", "All integrations"], ["connected", "Connected"],
  ...Object.entries(categories).map(([key, item]) => [key, item.label]),
  ["available", "Available integrations"],
];
type Provider = {
  name: string;
  category: keyof typeof categories;
  description: string;
  href?: string;
  state: string;
  accounts?: string[];
  sync?: Date | null;
};
const forthcoming: [keyof typeof categories, string[], string][] = [
  ["email", ["Gmail", "Google Workspace", "Microsoft Outlook", "Microsoft 365", "SMTP/IMAP", "Zoho Mail"], "Mailbox synchronisation and replies."],
  ["messaging", ["WhatsApp Business Cloud API", "Vonage", "Telnyx", "Termii", "Africa’s Talking"], "Business messaging with provider-specific capabilities."],
  ["calendar", ["Google Calendar", "Microsoft Outlook Calendar"], "External calendars and appointment synchronisation."],
  ["calendar", ["EncifOne Booking Pages"], "Public appointment scheduling."],
];
const latest = (rows: { lastSyncAt: Date | null }[]) =>
  rows.reduce<Date | null>((date, item) => item.lastSyncAt && (!date || item.lastSyncAt > date) ? item.lastSyncAt : date, null);

export default async function Communications({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.ORG_UPDATE_SETTINGS)) notFound();
  const { filter = "all" } = await searchParams;
  const { mailboxes, numbers, widgets, ai, aiActive, metrics } = await getIntegrationOverview(acting);
  const providers: Provider[] = [
    { name: "Resend", category: "email", description: "Shared inbox email and delivery tracking.", href: "/communications/manage/resend",
      state: mailboxes.some((row) => row.enabled && row.lastError) ? "Connection failed" : mailboxes.some((row) => row.enabled) ? "Connected" : "Not connected",
      accounts: mailboxes.map((row) => row.address), sync: latest(mailboxes) },
    { name: "Twilio SMS", category: "messaging", description: "Two-way SMS on an existing Twilio number.", href: "/communications/manage/twilio",
      state: numbers.some((row) => row.enabled) ? "Connected" : "Not connected", accounts: numbers.map((row) => row.number), sync: latest(numbers) },
    { name: "EncifOne Website Chat", category: "chat", description: "Embed a chat launcher on your website.", href: "/communications/manage/website-chat",
      state: widgets.some((row) => row.enabled) ? "Connected" : widgets.length ? "Disabled" : "Configuration required", accounts: widgets.map((row) => row.name) },
    { name: "Anthropic", category: "ai", description: "Draft replies and analyse conversations with the existing AI gateway.", href: "/members",
      state: aiActive ? "Connected" : ai.provider === "ANTHROPIC" && !ai.enabled ? "Disabled" : "Configuration required" },
    ...forthcoming.flatMap(([category, names, description]) => names.map((name) => ({ category, name, description, state: "Coming soon" }))),
  ];
  const visible = providers.filter((provider) => {
    if (filter === "connected") return provider.state === "Connected";
    if (filter === "available") return Boolean(provider.href) && provider.state !== "Connected";
    return !filters.some(([key]) => key === filter) || filter === "all" || provider.category === filter;
  });
  const overview = [
    ["Connected integrations", metrics.providers], ["Active communication channels", metrics.activeChannels],
    ["Messages sent this month", metrics.sent], ["Messages received this month", metrics.received],
    ["Failed deliveries this month", metrics.failed], ["Integrations requiring attention", metrics.attention],
  ] as const;
  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <PageHeader title="Communication Centre" description="Connect and manage your business communication channels from one place." />
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {overview.map(([label, value]) => (
          <Card key={label}><CardContent className="flex items-center justify-between gap-3 pt-0">
            <dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
          </CardContent></Card>
        ))}
      </dl>
      <nav className="flex flex-wrap gap-2" aria-label="Filter integrations">
        {filters.map(([key, label]) => <Link key={key} href={key === "all" ? "/communications" : `/communications?filter=${key}`}
          aria-current={filter === key ? "page" : undefined} className={buttonVariants({ variant: filter === key ? "default" : "outline", size: "sm" })}>{label}</Link>)}
      </nav>
      {visible.length === 0 && <p className="text-sm text-muted-foreground">No integrations match this filter.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((provider) => {
          const Icon = categories[provider.category].icon;
          return (
            <Card key={provider.name} className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-start gap-2">
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0" /><span>{provider.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col items-start gap-3">
                <Badge variant={provider.state === "Connection failed" ? "destructive" : "outline"}>{provider.state}</Badge>
                <p className="text-sm text-muted-foreground">{provider.description}</p>
                {!!provider.accounts?.length && <p className="break-all text-sm">{provider.accounts.slice(0, 3).join(", ")}{provider.accounts.length > 3 && ` and ${provider.accounts.length - 3} more`}</p>}
                {provider.sync && <p className="text-sm text-muted-foreground">Last activity <time dateTime={provider.sync.toISOString()}>{provider.sync.toISOString().slice(0, 10)}</time></p>}
                {provider.href && <Link className={buttonVariants({ variant: "outline", size: "sm", className: "mt-auto" })} href={provider.href}
                  aria-label={`Manage ${provider.name}`}>{provider.state === "Connected" ? "Manage" : "Configure"}</Link>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
