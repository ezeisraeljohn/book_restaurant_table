export type Restaurant = {
  id: number;
  name: string;
  openTime: string;
  closeTime: string;
  totalTables: number;
};

export type RestaurantTable = {
  id: number;
  restaurantId: number;
  tableNumber: string;
  capacity: number;
};

export type Reservation = {
  id: number;
  restaurantId: number;
  tableId: number;
  customerName: string;
  phone: string;
  partySize: number;
  startTime: string;
  endTime: string;
  status: string;
};
