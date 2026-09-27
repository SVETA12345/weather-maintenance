import { DataTypes, literal } from 'sequelize';

const attributes = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
    },
    region: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    lat: {
        type: DataTypes.DOUBLE,
        allowNull: false,
    },
    lon: {
        type: DataTypes.DOUBLE,
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
    tableName: 'sites',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

export function defineSiteModel(sequelize) {
    return sequelize.define('Site', attributes, options);
}
