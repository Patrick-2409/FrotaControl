const cleanText = (value) => String(value || "").trim();

export const formatVehicleOperationalCode = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "ID pendente";
  return `ID ${String(Math.trunc(numeric)).padStart(2, "0")}`;
};

export const formatVehicleBrandModel = (vehicle = {}) =>
  [cleanText(vehicle.marca), cleanText(vehicle.modelo)].filter(Boolean).join(" ");

export const formatVehicleOptionLabel = (vehicle = {}) => {
  const code = formatVehicleOperationalCode(vehicle.codigo_operacional);
  const plate = cleanText(vehicle.placa) || "Sem placa";
  const name = cleanText(vehicle.nome) || "Veículo";
  const brandModel = formatVehicleBrandModel(vehicle);
  return [code, plate, name, brandModel].filter(Boolean).join(" - ");
};
