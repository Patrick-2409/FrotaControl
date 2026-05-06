const jwt = require("jsonwebtoken");

const buildToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      empresa_id: user.empresa_id,
      role: user.role,
      nome: user.nome,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );

module.exports = {
  buildToken,
};
