import { DataTypes, literal } from 'sequelize';

const attributes = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    full_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
    },
    specialization: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    personnel_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
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
    tableName: 'technicians',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

export function defineTechnicianModel(sequelize) {
    return sequelize.define('Technician', attributes, options);
}
