const cleanText = (value) => String(value || "").trim();

const operationalPrefix = (vehicle = {}) => (vehicle.usa_para_transporte ? "#" : "A");

export const formatVehicleOperationalCode = (value, vehicle = null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "ID pendente";
  const code = String(Math.trunc(numeric)).padStart(2, "0");
  return vehicle ? `${operationalPrefix(vehicle)}${code}` : `ID ${code}`;
};

export const formatVehicleBrandModel = (vehicle = {}) =>
  [cleanText(vehicle.marca), cleanText(vehicle.modelo)].filter(Boolean).join(" ");

export const formatVehicleOptionLabel = (vehicle = {}) => {
  const code = formatVehicleOperationalCode(vehicle.codigo_operacional, vehicle);
  const plate = cleanText(vehicle.placa) || "Sem placa";
  const name = cleanText(vehicle.nome) || "Veículo";
  const brandModel = formatVehicleBrandModel(vehicle);
  return [code, plate, name, brandModel].filter(Boolean).join(" - ");
};
