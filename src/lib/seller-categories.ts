/**
 * Seller application categories. Plain shared module — deliberately NOT in
 * the "use server" actions file, since server-action modules may only export
 * async functions (a const exported from one reaches the client as a broken
 * server-reference proxy).
 */
export const SELLER_CATEGORIES = [
  "Fashion & apparel",
  "Sneakers & streetwear",
  "Jewellery & accessories",
  "Beauty & care",
  "Collectibles & toys",
  "Electronics & gadgets",
  "Home & decor",
  "Other",
] as const;
