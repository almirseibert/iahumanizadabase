import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { queueSystemTemplate } from "../whatsapp/messaging.service.js";

/** Processa um envio de campanha (um contato). Roda na fila rate-limited. */
export async function processCampaignSend(campaignId: string, contactId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });
  if (!campaign || campaign.status !== "SENDING") return;

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.optOut) {
    await bumpAndMaybeFinish(campaignId, "failed");
    return;
  }

  try {
    await queueSystemTemplate(
      campaign.tenantId,
      contactId,
      { name: campaign.template.name, language: campaign.template.language },
      campaign.bodyParams,
      `📣 [campanha ${campaign.name}] ${campaign.template.body}`,
    );
    await bumpAndMaybeFinish(campaignId, "sent");
  } catch (err) {
    logger.error({ err, campaignId, contactId }, "falha em envio de campanha");
    await bumpAndMaybeFinish(campaignId, "failed");
  }
}

async function bumpAndMaybeFinish(campaignId: string, kind: "sent" | "failed"): Promise<void> {
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: kind === "sent" ? { sentCount: { increment: 1 } } : { failedCount: { increment: 1 } },
  });
  if (updated.sentCount + updated.failedCount >= updated.totalCount && updated.status === "SENDING") {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "DONE", finishedAt: new Date() },
    });
  }
}
