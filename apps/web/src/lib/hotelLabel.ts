import type { HotelSummary } from "../api/gateway";

/** Display label for a hotel; includes chain when viewing all brands. */
export function formatHotelLabel(
  hotelId: string | undefined,
  hotels: Map<string, HotelSummary>,
  showChain: boolean
): string {
  if (!hotelId) return "Unknown hotel";
  const hotel = hotels.get(hotelId);
  if (!hotel) return hotelId.slice(0, 8);
  if (showChain && hotel.chain_name) {
    return `${hotel.name} · ${hotel.chain_name}`;
  }
  return hotel.name;
}

export function hotelOptionLabel(hotel: HotelSummary, showChain: boolean): string {
  if (showChain && hotel.chain_name) {
    return `${hotel.name} · ${hotel.chain_name}`;
  }
  return hotel.name;
}
