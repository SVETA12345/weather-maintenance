import { Op } from 'sequelize';
import { models } from '../models/sequelize.js';

const { RefreshToken } = models;

export const refreshTokensRepository = {
    async create({ userId, tokenHash, expiresAt }) {
        return RefreshToken.create({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt });
    },

    // Активный токен: найден по хешу, не отозван и не истёк.
    async findActiveByHash(tokenHash) {
        return RefreshToken.findOne({
            where: {
                token_hash: tokenHash,
                revoked_at: null,
                expires_at: { [Op.gt]: new Date() },
            },
        });
    },

    async revokeByHash(tokenHash) {
        const [count] = await RefreshToken.update(
            { revoked_at: new Date() },
            { where: { token_hash: tokenHash, revoked_at: null } },
        );
        return count;
    },
};