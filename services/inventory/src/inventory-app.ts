import { Hono } from "hono";
import type { Env } from "./types";
import { getRoomTypeAvailability } from "./handlers/availability";
import { getRoomTypeCalendar } from "./handlers/calendar";
import { getHotel } from "./handlers/hotel-detail";
import { getChainByCode, listChains } from "./handlers/chains";
import {
  getEnterpriseByCode,
  getEnterpriseById,
  listEnterpriseChains,
  listEnterpriseChainsById,
  listEnterprises,
} from "./handlers/enterprises";
import { listHotels } from "./handlers/hotels";
import { listRoomTypes } from "./handlers/room-types";
import { searchStays } from "./handlers/search";
import { createSoftHold, releaseSoftHold } from "./handlers/soft-holds";
import {
  createAdminStaff,
  listAdminStaff,
  patchAdminStaff,
  putAdminStaffChains,
} from "./handlers/admin-staff";
import {
  createAdminBlock,
  deleteAdminBlock,
  listAdminBlocks,
} from "./handlers/admin-blocks";
import { createAdminChain, patchAdminChain } from "./handlers/admin-chains";
import {
  createAdminPromotion,
  listAdminPromotions,
  patchAdminPromotion,
} from "./handlers/admin-promotions";
import {
  createAdminRatePlan,
  getAdminRatePlan,
  listAdminRatePlans,
  patchAdminRatePlan,
  putAdminRatePlanLosTiers,
} from "./handlers/admin-rate-plans";
import {
  createAdminHotel,
  getAdminHotel,
  listAdminHotels,
  patchAdminHotel,
} from "./handlers/admin-hotels";
import {
  createAdminRoomType,
  getAdminRoomType,
  listAdminRoomTypes,
  patchAdminRoomType,
} from "./handlers/admin-room-types";
import { getMyChains, getStaffAccess } from "./handlers/staff-access";
import { getInternalStaffClaims } from "./handlers/staff-claims";
import { acceptStaffInvite, createStaffInvite } from "./handlers/staff-invite";
import {
  createPlatformBootstrapInvite,
  createPlatformEnterprise,
  listPlatformEnterprises,
  patchPlatformEnterprise,
} from "./handlers/platform-enterprises";

export function inventoryApp() {
  const r = new Hono<{ Bindings: Env }>();
  r.get("/enterprises", listEnterprises);
  r.get("/enterprises/by-id/:enterpriseId", getEnterpriseById);
  r.get("/enterprises/by-id/:enterpriseId/chains", listEnterpriseChainsById);
  r.get("/enterprises/:code", getEnterpriseByCode);
  r.get("/enterprises/:code/chains", listEnterpriseChains);
  r.get("/staff/access", getStaffAccess);
  r.get("/internal/staff/claims", getInternalStaffClaims);
  r.get("/me/chains", getMyChains);
  r.post("/invites/accept", acceptStaffInvite);
  r.get("/platform/enterprises", listPlatformEnterprises);
  r.post("/platform/enterprises", createPlatformEnterprise);
  r.patch("/platform/enterprises/:enterpriseId", patchPlatformEnterprise);
  r.post(
    "/platform/enterprises/:enterpriseId/bootstrap-invite",
    createPlatformBootstrapInvite
  );
  r.get("/admin/staff", listAdminStaff);
  r.post("/admin/staff", createAdminStaff);
  r.post("/admin/staff/invite", createStaffInvite);
  r.patch("/admin/staff/:id", patchAdminStaff);
  r.put("/admin/staff/:id/chains", putAdminStaffChains);
  r.post("/admin/chains", createAdminChain);
  r.patch("/admin/chains/:chainId", patchAdminChain);
  r.get("/admin/chains/:chainId/rate-plans", listAdminRatePlans);
  r.post("/admin/chains/:chainId/rate-plans", createAdminRatePlan);
  r.get("/admin/chains/:chainId/promotions", listAdminPromotions);
  r.post("/admin/chains/:chainId/promotions", createAdminPromotion);
  r.get("/admin/chains/:chainId/hotels", listAdminHotels);
  r.post("/admin/chains/:chainId/hotels", createAdminHotel);
  r.get("/admin/hotels/:hotelId/room-types", listAdminRoomTypes);
  r.post("/admin/hotels/:hotelId/room-types", createAdminRoomType);
  r.get("/admin/hotels/:hotelId", getAdminHotel);
  r.patch("/admin/hotels/:hotelId", patchAdminHotel);
  r.get("/admin/room-types/:roomTypeId", getAdminRoomType);
  r.patch("/admin/room-types/:roomTypeId", patchAdminRoomType);
  r.get("/admin/room-types/:roomTypeId/blocks", listAdminBlocks);
  r.post("/admin/room-types/:roomTypeId/blocks", createAdminBlock);
  r.get("/admin/rate-plans/:ratePlanId", getAdminRatePlan);
  r.patch("/admin/rate-plans/:ratePlanId", patchAdminRatePlan);
  r.put("/admin/rate-plans/:ratePlanId/los-tiers", putAdminRatePlanLosTiers);
  r.patch("/admin/promotions/:promotionId", patchAdminPromotion);
  r.delete("/admin/blocks/:blockId", deleteAdminBlock);
  r.get("/chains", listChains);
  r.get("/chains/:code", getChainByCode);
  r.get("/search", searchStays);
  r.delete("/soft-holds/:holdId", releaseSoftHold);
  r.post(
    "/hotels/:hotelId/room-types/:roomTypeId/soft-holds",
    createSoftHold
  );
  r.get("/hotels", listHotels);
  r.get(
    "/hotels/:hotelId/room-types/:roomTypeId/calendar",
    getRoomTypeCalendar
  );
  r.get(
    "/hotels/:hotelId/room-types/:roomTypeId/availability",
    getRoomTypeAvailability
  );
  r.get("/hotels/:hotelId/room-types", listRoomTypes);
  r.get("/hotels/:id", getHotel);
  return r;
}
