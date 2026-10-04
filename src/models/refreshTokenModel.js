import { DataTypes, literal } from 'sequelize';

// Хранилище выданных refresh-токенов: в БД лежит только SHA-256 хеш токена,
// поэтому сам токен существует исключительно в HttpOnly-cookie у клиента.
// Запись позволяет отозвать сессию (logout) и обнаружить подмену токена.
const attributes = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    },
    token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
    },
};

const options = {
    tableName: 'refresh_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // запись только создаётся и помечается отозванной
    indexes: [{ name: 'idx_refresh_tokens_user_id', fields: ['user_id'] }],
};

export function defineRefreshTokenModel(sequelize) {
    return sequelize.define('RefreshToken', attributes, options);
}