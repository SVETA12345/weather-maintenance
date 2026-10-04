import { DataTypes, literal } from 'sequelize';

// Роли пользователя: viewer — чтение, technician — работа с заявками,
// admin — все операции. Роль выдаёт администратор (вручную или сидером).
export const USER_ROLES = ['viewer', 'technician', 'admin'];

const attributes = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
    },
    // Только хеш с солью (bcrypt), пароль в открытом виде не сохраняется и не возвращается.
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    role: {
        type: DataTypes.ENUM(...USER_ROLES),
        allowNull: false,
        defaultValue: 'viewer',
    },
    // Связь учётной записи со специалистом: по ней проверяется право technician
    // менять статус заявок, на которых он назначен.
    technician_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'technicians', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' },
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
    },
};

const options = {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

export function defineUserModel(sequelize) {
    return sequelize.define('User', attributes, options);
}