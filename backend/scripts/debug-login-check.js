require("dotenv").config();
const bcrypt = require("bcryptjs");
const {
  getMotoristaByLogin,
  getAdminEmpresaByEmail,
  getSuperAdminByEmail,
} = require("../src/models/userModel");

async function main() {
  const superAdminEmail = "admin@frotacontrol.com";
  const adminEmpresaEmail = "antonio.benevenuto@portocentral.com.br";
  const motoristaLogin = "11111111111";

  const superAdmin = await getSuperAdminByEmail(superAdminEmail);
  const adminEmpresa = await getAdminEmpresaByEmail(adminEmpresaEmail);
  const motoristas = await getMotoristaByLogin(motoristaLogin);
  const motorista = motoristas[0] || null;

  console.log("SUPER_ADMIN user:", superAdmin ? { id: superAdmin.id, email: superAdmin.email, role: superAdmin.role } : null);
  console.log("ADMIN_EMPRESA user:", adminEmpresa ? { id: adminEmpresa.id, email: adminEmpresa.email, role: adminEmpresa.role } : null);
  console.log(
    "MOTORISTA users:",
    motoristas.map((m) => ({ id: m.id, email: m.email, cpf_id: m.cpf_id, role: m.role }))
  );

  if (superAdmin) {
    const ok = await bcrypt.compare("AdminSistema123", superAdmin.senha_hash);
    console.log("SUPER_ADMIN password check:", ok);
  }
  if (adminEmpresa) {
    const ok = await bcrypt.compare("AdminEmpresa123", adminEmpresa.senha_hash);
    console.log("ADMIN_EMPRESA password check:", ok);
  }
  if (motorista) {
    const ok = await bcrypt.compare("Motorista123", motorista.senha_hash);
    console.log("MOTORISTA password check:", ok);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
