import { Hono } from "hono";
import type { Env } from "./types";
import { getRoomTypeAvailability } from "./handlers/availability";
import { getRoomTypeCalendar } from "./handlers/calendar";
import { getHotel } from "./handlers/hotel-detail";
import { listHotels } from "./handlers/hotels";
import { listRoomTypes } from "./handlers/room-types";
import { searchStays } from "./handlers/search";

export function inventoryApp() {
  const r = new Hono<{ Bindings: Env }>();
  r.get("/search", searchStays);
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
