import { DataTypes, literal } from 'sequelize';

const attributes = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    site_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'sites', key: 'id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    type: {
        type: DataTypes.ENUM('turbine', 'inverter', 'sensor', 'substation'),
        allowNull: false,
    },
    serial_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
    },
    status: {
        type: DataTypes.ENUM('operational', 'maintenance', 'fault', 'decommissioned'),
        allowNull: false,
        defaultValue: 'operational',
    },
    installed_at: {
        type: DataTypes.DATE,
        allowNull: false,
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
    tableName: 'equipment',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

export function defineEquipmentModel(sequelize) {
    return sequelize.define('Equipment', attributes, options);
}
