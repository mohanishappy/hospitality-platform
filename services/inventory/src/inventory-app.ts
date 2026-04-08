import { Hono } from "hono";
import type { Env } from "./types";
import { getHotel } from "./handlers/hotel-detail";
import { listHotels } from "./handlers/hotels";
import { listRoomTypes } from "./handlers/room-types";

export function inventoryApp() {
  const r = new Hono<{ Bindings: Env }>();
  r.get("/hotels", listHotels);
  r.get("/hotels/:hotelId/room-types", listRoomTypes);
  r.get("/hotels/:id", getHotel);
  return r;
}
