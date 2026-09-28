import { DataTypes, literal } from 'sequelize';

const attributes = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    equipment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true, // 1:1 — паспорт ровно один на единицу оборудования
        references: { model: 'equipment', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    },
    manufacturer: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    model: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    rated_power: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
    },
    last_calibration_at: {
        type: DataTypes.DATE,
        allowNull: true,
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
    tableName: 'equipment_passports',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

export function defineEquipmentPassportModel(sequelize) {
    return sequelize.define('EquipmentPassport', attributes, options);
}
