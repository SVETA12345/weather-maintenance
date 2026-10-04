import bcrypt from 'bcrypt';
import { config } from '../config/index.js';

// bcrypt хеширует пароль солью (она внутри хеша) и молча обрезает ввод до 72 байт,
// поэтому длина пароля ограничивается схемой ввода.
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_MIN_LENGTH = 8;

export function hashPassword(plain) {
    return bcrypt.hash(plain, config.auth.bcryptRounds);
}

export function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

// Хеш заведомо несуществующего пароля: сравнение с ним занимает столько же времени,
// сколько настоящая проверка, поэтому по времени ответа нельзя отличить
// несуществующего пользователя от неверного пароля.
export const DUMMY_PASSWORD_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO1sJ0kPvXq0FbBFvEDPkLpHUnh0zFmTG';