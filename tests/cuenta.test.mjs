// Cuenta: enlaces de los correos de Supabase («He olvidado mi contraseña») y consentimientos.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseAuthLink } = await import('../js/util.js');

test('una dirección normal no se toca', () => {
  assert.equal(parseAuthLink(''), null);
  assert.equal(parseAuthLink('#'), null);
  assert.equal(parseAuthLink('#hoy'), null);
  assert.equal(parseAuthLink('#type=recovery'), null);
});

test('el código de un uso de la plantilla recomendada abre «Contraseña nueva»', () => {
  assert.deepEqual(parseAuthLink('#token_hash=abc123&type=recovery'), { strip: true, rec: { hash: 'abc123' } });
});

test('la sesión de la plantilla por defecto también vale, y se quita de la dirección', () => {
  const r = parseAuthLink('#access_token=xyz&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery');
  assert.deepEqual(r, { strip: true, rec: { token: 'xyz' } });
});

test('un enlace caducado avisa', () => {
  assert.deepEqual(parseAuthLink('#error=access_denied&error_code=otp_expired&error_description=Email+link'), { strip: true, rec: { linkError: 'otp_expired' } });
});

test('otros enlaces de cuenta se quitan de la dirección sin abrir ninguna hoja', () => {
  assert.deepEqual(parseAuthLink('#access_token=xyz&refresh_token=r1&type=magiclink'), { strip: true, rec: null });
  assert.deepEqual(parseAuthLink('#token_hash=abc&type=signup'), { strip: true, rec: null });
});

// Consentimiento de datos de salud: qué falta según lo que devuelve el servidor
const { missingConsents, CONSENTS } = await import('../js/util.js');

test('sin consentimientos falta el de salud', () => {
  assert.deepEqual(missingConsents([]), ['health']);
  assert.deepEqual(missingConsents(null), ['health']);
});

test('con el de salud en la versión vigente no falta nada', () => {
  assert.deepEqual(missingConsents([{ kind: 'health', version: CONSENTS.health, given_at: '2026-11-18T10:00:00Z' }]), []);
});

test('una versión anterior del texto no vale: se vuelve a pedir', () => {
  assert.deepEqual(missingConsents([{ kind: 'health', version: 1 }], { health: 2 }), ['health']);
  assert.deepEqual(missingConsents([{ kind: 'health', version: 1 }, { kind: 'health', version: 2 }], { health: 2 }), []);
});

test('un consentimiento de otro tipo no cuenta', () => {
  assert.deepEqual(missingConsents([{ kind: 'terms', version: 1 }]), ['health']);
});
