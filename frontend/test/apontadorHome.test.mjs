import test from "node:test";
import assert from "node:assert/strict";
import { storageKeyVeiculo } from "../src/utils/apontadorHome.js";

test("storageKeyVeiculo isola preferencia por empresa e usuario", () => {
  assert.equal(storageKeyVeiculo(10, 20), "fc_apontador_veiculo_id:10:20");
  assert.notEqual(storageKeyVeiculo(10, 20), storageKeyVeiculo(10, 21));
});
