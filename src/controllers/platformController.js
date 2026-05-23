const bcrypt = require('bcryptjs');
const { Op, col, fn, literal } = require('sequelize');
const { sequelize, Organization, User, Visit, TemiRobot, Branch, Location } = require('../models');

// ── Organizations CRUD ────────────────────────────────────────────────────

const listOrganizations = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const total = await Organization.count({ where });
    const organizations = await Organization.findAll({
      where,
      attributes: {
        include: [
          [literal('COUNT(DISTINCT "users"."id") FILTER (WHERE "users"."is_active" = TRUE)'), 'active_employees'],
          [literal('COUNT(DISTINCT "visits"."id") FILTER (WHERE "visits"."created_at" > NOW() - INTERVAL \'30 days\')'), 'visits_last_30d'],
        ],
      },
      include: [
        { model: User, as: 'users', attributes: [], required: false, where: { role: { [Op.ne]: 'platform_super_admin' } } },
        { model: Visit, as: 'visits', attributes: [], required: false },
      ],
      group: ['Organization.id'],
      order: [[literal('"Organization"."created_at"'), 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      subQuery: false,
      raw: true,
      nest: false,
    });

    res.json({
      organizations,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
};

const getOrganization = async (req, res, next) => {
  try {
    const rows = await Organization.findAll({
      where: { id: req.params.id },
      attributes: {
        include: [
          [literal('COUNT(DISTINCT "users"."id") FILTER (WHERE "users"."is_active" = TRUE)'), 'active_employees'],
          [literal('COUNT(DISTINCT "branches"."id")'), 'branch_count'],
          [literal('COUNT(DISTINCT "robots"."id")'), 'robot_count'],
        ],
      },
      include: [
        { model: User, as: 'users', attributes: [], required: false },
        { model: Branch, as: 'branches', attributes: [], required: false },
        { model: TemiRobot, as: 'robots', attributes: [], required: false },
      ],
      group: ['Organization.id'],
      subQuery: false,
      raw: true,
      nest: false,
    });
    if (!rows.length) return res.status(404).json({ error: 'Organization not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const createOrganization = async (req, res, next) => {
  try {
    const { name, slug, domain, address, phone, email, plan, maxEmployees,
            adminName, adminEmail, adminPassword } = req.body;

    if (!name || !slug || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'name, slug, adminEmail, adminPassword are required' });
    }

    const result = await sequelize.transaction(async (t) => {
      const org = await Organization.create({
        name,
        slug: slug.toLowerCase(),
        domain,
        address,
        phone,
        email,
        plan: plan || 'standard',
        max_employees: maxEmployees || 100,
      }, { transaction: t });

      const hash = await bcrypt.hash(adminPassword, 12);
      const user = await User.create({
        email: adminEmail.toLowerCase(),
        password_hash: hash,
        name: adminName || adminEmail.split('@')[0],
        role: 'org_super_admin',
        organization_id: org.id,
        is_active: true,
      }, { transaction: t });

      return { org, user };
    });

    res.status(201).json({
      organization: result.org.toJSON(),
      admin: {
        id: result.user.id, email: result.user.email,
        name: result.user.name, role: result.user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

const updateOrganization = async (req, res, next) => {
  try {
    const { name, domain, address, phone, email, plan, maxEmployees, isActive } = req.body;

    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    if (name != null) org.name = name;
    if (domain != null) org.domain = domain;
    if (address != null) org.address = address;
    if (phone != null) org.phone = phone;
    if (email != null) org.email = email;
    if (plan != null) org.plan = plan;
    if (maxEmployees != null) org.max_employees = maxEmployees;
    if (isActive != null) org.is_active = isActive;
    await org.save();

    res.json(org.toJSON());
  } catch (err) {
    next(err);
  }
};

const deleteOrganization = async (req, res, next) => {
  try {
    await Organization.update({ is_active: false }, { where: { id: req.params.id } });
    res.json({ message: 'Organization deactivated' });
  } catch (err) {
    next(err);
  }
};

// ── Platform Analytics ─────────────────────────────────────────────────────

const getPlatformAnalytics = async (req, res, next) => {
  try {
    const [orgs, totalUsers, totalVisits, totalRobots, recentActivity] = await Promise.all([
      Organization.findOne({
        attributes: [
          [literal('COUNT(*)'), 'total'],
          [literal('COUNT(*) FILTER (WHERE is_active)'), 'active'],
        ],
        raw: true,
      }),
      User.count({ where: { role: { [Op.ne]: 'platform_super_admin' } } }),
      Visit.count(),
      TemiRobot.count(),
      Organization.findAll({
        attributes: [
          [col('Organization.name'), 'org_name'],
          [fn('COUNT', col('visits.id')), 'visits_today'],
        ],
        include: [{
          model: Visit, as: 'visits', attributes: [], required: false,
          where: literal('DATE("visits"."created_at") = CURRENT_DATE'),
        }],
        group: ['Organization.id', 'Organization.name'],
        order: [[fn('COUNT', col('visits.id')), 'DESC']],
        limit: 10,
        subQuery: false,
        raw: true,
      }),
    ]);

    res.json({
      organizations: orgs,
      totalUsers,
      totalVisits,
      totalRobots,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
};

// ── All robots across all orgs ─────────────────────────────────────────────

const listAllRobots = async (req, res, next) => {
  try {
    const robots = await TemiRobot.findAll({
      attributes: {
        include: [
          [col('organization.name'), 'org_name'],
          [col('location.name'), 'location_name'],
        ],
      },
      include: [
        { model: Organization, as: 'organization', attributes: [], required: false },
        { model: Location, as: 'location', attributes: [], required: false },
      ],
      order: [[literal('"organization"."name"'), 'ASC'], [literal('"TemiRobot"."name"'), 'ASC']],
      raw: true,
      nest: false,
    });
    res.json(robots);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization,
  getPlatformAnalytics, listAllRobots,
};
