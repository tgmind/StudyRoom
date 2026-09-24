import { PublicWebsiteContent } from "./types";

/**
 * Replace any hardcoded or legacy currency tokens (e.g. ₹50, ₹ 50, ₹20, etc.)
 * in a string with the live configured membership price.
 * Retains ₹0 if used in referral/waiver context.
 */
export function syncPriceInText(text: string | null | undefined, priceInr: number): string {
  if (!text || typeof text !== "string") return "";
  const price = typeof priceInr === "number" && !isNaN(priceInr) && priceInr >= 0 ? priceInr : 50;

  // 1. Explicitly replace ₹50, ₹ 50, &#8377;50 first
  let result = text
    .replace(/&#8377;\s*50/gi, `₹${price}`)
    .replace(/₹\s*50\b/g, `₹${price}`)
    .replace(/Rs\.?\s*50\b/gi, `₹${price}`);

  // 2. Also replace patterns like "₹ <number>" where number != 0
  result = result.replace(/₹\s*(\d+)/g, (match, digits) => {
    // If it's ₹0 and refers to free/waiver, preserve it
    if (digits === "0" && (text.toLowerCase().includes("free") || text.toLowerCase().includes("waived") || text.toLowerCase().includes("off"))) {
      return match;
    }
    return `₹${price}`;
  });

  return result;
}

/**
 * Returns a new PublicWebsiteContent object with all text references
 * (hero, steps, membership, conditions, policies, and FAQs)
 * synchronized with the active membership price.
 */
export function synchronizeContentPricing(
  content: PublicWebsiteContent,
  overridePrice?: number
): PublicWebsiteContent {
  if (!content) return content;

  const price = typeof overridePrice === "number" && !isNaN(overridePrice) && overridePrice >= 0
    ? overridePrice
    : (typeof content.membership?.priceInr === "number" && !isNaN(content.membership.priceInr)
        ? content.membership.priceInr
        : 50);

  return {
    ...content,
    hero: {
      ...content.hero,
      ctaPrimaryText: syncPriceInText(content.hero?.ctaPrimaryText, price),
    },
    howItWorks: Array.isArray(content.howItWorks)
      ? content.howItWorks.map((step) => ({
          ...step,
          title: syncPriceInText(step.title, price),
          description: syncPriceInText(step.description, price),
        }))
      : [],
    membership: {
      ...content.membership,
      priceInr: price,
      badgeText: syncPriceInText(content.membership?.badgeText, price),
      description: syncPriceInText(content.membership?.description, price),
      securityNote: syncPriceInText(content.membership?.securityNote, price),
      whyFeeTitle: syncPriceInText(content.membership?.whyFeeTitle, price),
      whyFeePoints: Array.isArray(content.membership?.whyFeePoints)
        ? content.membership.whyFeePoints.map((pt) => syncPriceInText(pt, price))
        : [],
      steps: Array.isArray(content.membership?.steps)
        ? content.membership.steps.map((st) => ({
            ...st,
            title: syncPriceInText(st.title, price),
            description: syncPriceInText(st.description, price),
          }))
        : [],
    },
    conditions: {
      ...content.conditions,
      paymentConditions: Array.isArray(content.conditions?.paymentConditions)
        ? content.conditions.paymentConditions.map((pc) => syncPriceInText(pc, price))
        : [],
      refundPolicy: syncPriceInText(content.conditions?.refundPolicy, price),
      cancellationPolicy: syncPriceInText(content.conditions?.cancellationPolicy, price),
    },
    faqs: Array.isArray(content.faqs)
      ? content.faqs.map((faq) => ({
          ...faq,
          question: syncPriceInText(faq.question, price),
          answer: syncPriceInText(faq.answer, price),
        }))
      : [],
  };
}
