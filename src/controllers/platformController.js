const bcrypt = require('bcryptjs');
const { Op, col, fn, literal } = require('sequelize');
const { sequelize, Organization, User, Visit, TemiRobot, Branch, Location, AuditLog, Visitor } = require('../models');

const PLAN_PRICES = { standard: 49, professional: 149, enterprise: 499 };
const STAFF_ROLES  = ['admin', 'sub_admin', 'employee'];

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
        { model: User, as: 'users', attributes: [], required: false, where: { role: { [Op.ne]: 'super_admin' } } },
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

    res.set('Cache-Control', 'no-store');
    res.json({ organizations, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
};

const getOrganization = async (req, res, next) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [employeeCount, robotCount, visitsTotal, visitsThisMonth] = await Promise.all([
      User.count({
        where: {
          organization_id: org.id,
          role: { [Op.in]: STAFF_ROLES },
          is_active: true,
        },
      }),
      TemiRobot.count({ where: { organization_id: org.id } }),
      Visit.count({ where: { organization_id: org.id } }),
      Visit.count({
        where: {
          organization_id: org.id,
          created_at: {
            [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    res.json({
      ...org.toJSON(),
      usage: { employeeCount, robotCount, visitsTotal, visitsThisMonth },
    });
  } catch (err) {
    next(err);
  }
};

const createOrganization = async (req, res, next) => {
  try {
    const {
      name, slug, domain, address, phone, email, plan, maxEmployees,
      adminName, adminEmail, adminPassword,
      subscriptionStart, subscriptionEnd, billingEmail, maxRobots,
    } = req.body;

    if (!name || !slug || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'name, slug, adminEmail, adminPassword are required' });
    }

    const limits = PLAN_PRICES[plan] ? plan : 'standard';
    const planDefaults = { standard: { emp: 10, robots: 1 }, professional: { emp: 50, robots: 3 }, enterprise: { emp: 500, robots: 10 } };
    const defaults = planDefaults[limits];

    const result = await sequelize.transaction(async (t) => {
      const org = await Organization.create({
        name,
        slug: slug.toLowerCase(),
        domain,
        address,
        phone,
        email,
        plan: limits,
        max_employees: maxEmployees || defaults.emp,
        subscription_start: subscriptionStart || new Date(),
        subscription_end: subscriptionEnd || null,
        billing_email: billingEmail || email,
        max_robots: maxRobots || defaults.robots,
      }, { transaction: t });

      const hash = await bcrypt.hash(adminPassword, 12);
      const user = await User.create({
        email: adminEmail.toLowerCase(),
        password_hash: hash,
        name: adminName || adminEmail.split('@')[0],
        role: 'super_admin',
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
    const {
      name, domain, address, phone, email, plan, maxEmployees, isActive,
      subscriptionStart, subscriptionEnd, billingEmail, maxRobots,
    } = req.body;

    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    if (name != null)              org.name              = name;
    if (domain != null)            org.domain            = domain;
    if (address != null)           org.address           = address;
    if (phone != null)             org.phone             = phone;
    if (email != null)             org.email             = email;
    if (plan != null)              org.plan              = plan;
    if (maxEmployees != null)      org.max_employees     = maxEmployees;
    if (isActive != null)          org.is_active         = isActive;
    if (subscriptionStart != null) org.subscription_start = subscriptionStart;
    if (subscriptionEnd !== undefined) org.subscription_end = subscriptionEnd || null;
    if (billingEmail != null)      org.billing_email     = billingEmail;
    if (maxRobots != null)         org.max_robots        = maxRobots;
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
          [literal('COUNT(*)::int'), 'total'],
          [literal('COUNT(*) FILTER (WHERE is_active)::int'), 'active'],
        ],
        raw: true,
      }),
      User.count({ where: { role: { [Op.ne]: 'super_admin' } } }),
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

    res.set('Cache-Control', 'no-store');
    res.json({
      organizations: {
        total: orgs?.total ?? 0,
        active: orgs?.active ?? 0,
      },
      totalOrganizations: orgs?.total ?? 0,
      activeOrganizations: orgs?.active ?? 0,
      totalUsers,
      totalVisits,
      totalRobots,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
};

// ── Platform Billing ───────────────────────────────────────────────────────

const getPlatformBilling = async (req, res, next) => {
  try {
    const [planDist, expiringSoon, totalActive] = await Promise.all([
      Organization.findAll({
        attributes: ['plan', [literal('COUNT(*)::int'), 'count']],
        where: { is_active: true },
        group: ['plan'],
        raw: true,
      }),
      Organization.findAll({
        where: {
          subscription_end: {
            [Op.between]: [new Date(), new Date(Date.now() + 30 * 86_400_000)],
          },
          is_active: true,
        },
        attributes: ['id', 'name', 'plan', 'subscription_end', 'email'],
        order: [['subscription_end', 'ASC']],
        raw: true,
      }),
      Organization.count({ where: { is_active: true } }),
    ]);

    const mrr = planDist.reduce((sum, r) => sum + (PLAN_PRICES[r.plan] || 0) * r.count, 0);

    const dist = { standard: 0, professional: 0, enterprise: 0 };
    planDist.forEach((r) => { if (r.plan in dist) dist[r.plan] = r.count; });

    res.set('Cache-Control', 'no-store');
    res.json({ mrr, planDist: dist, expiringSoon, totalActive });
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

// ── Platform Users CRUD ────────────────────────────────────────────────────

const listAllUsers = async (req, res, next) => {
  try {
    const { search, org, role, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (org)  where.organization_id = org;
    if (role) where.role = role;

    const { count, rows } = await User.findAndCountAll({
      where,
      include: [{ model: Organization, as: 'organization', attributes: ['id', 'name', 'slug'] }],
      attributes: { exclude: ['password_hash'] },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    res.json({ users: rows, total: count });
  } catch (err) { next(err); }
};

const createPlatformUser = async (req, res, next) => {
  try {
    const { name, email, password, role = 'employee', organizationId, phone, department } = req.body;
    if (!email || !password || !organizationId) {
      return res.status(400).json({ error: 'email, password, organizationId are required' });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      password_hash: hash,
      role,
      organization_id: organizationId,
      phone,
      department,
      is_active: true,
    });
    const safe = user.toJSON();
    delete safe.password_hash;
    res.status(201).json(safe);
  } catch (err) { next(err); }
};

const updatePlatformUser = async (req, res, next) => {
  try {
    const { name, email, role, phone, department, isActive, password } = req.body;
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (name != null)       user.name       = name;
    if (email != null)      user.email      = email.toLowerCase();
    if (role != null)       user.role       = role;
    if (phone != null)      user.phone      = phone;
    if (department != null) user.department = department;
    if (isActive != null)   user.is_active  = isActive;
    if (password)           user.password_hash = await bcrypt.hash(password, 12);
    await user.save();
    const safe = user.toJSON();
    delete safe.password_hash;
    res.json(safe);
  } catch (err) { next(err); }
};

const deletePlatformUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot deactivate a super admin' });
    await user.update({ is_active: false });
    res.json({ message: 'User deactivated' });
  } catch (err) { next(err); }
};

// ── Platform Visits ────────────────────────────────────────────────────────

const listAllVisits = async (req, res, next) => {
  try {
    const { org, status, type, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (org)    where.organization_id = org;
    if (status) where.status = status;
    if (type)   where.visit_type = type;

    const { count, rows } = await Visit.findAndCountAll({
      where,
      include: [
        { model: Organization, as: 'organization', attributes: ['id', 'name'] },
        { model: User,         as: 'host',         attributes: ['id', 'name', 'email'] },
        { model: Visitor,      as: 'visitor',      attributes: ['id', 'name', 'email', 'company', 'phone'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    res.json({ visits: rows, total: count });
  } catch (err) { next(err); }
};

const updatePlatformVisit = async (req, res, next) => {
  try {
    const { status, notes, declinedReason } = req.body;
    const visit = await Visit.findByPk(req.params.id);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    if (status != null)          visit.status          = status;
    if (notes != null)           visit.notes           = notes;
    if (declinedReason != null)  visit.declined_reason = declinedReason;
    await visit.save();
    res.json(visit);
  } catch (err) { next(err); }
};

const deletePlatformVisit = async (req, res, next) => {
  try {
    const deleted = await Visit.destroy({ where: { id: req.params.id } });
    if (!deleted) return res.status(404).json({ error: 'Visit not found' });
    res.json({ message: 'Visit deleted' });
  } catch (err) { next(err); }
};

// ── Audit Logs ─────────────────────────────────────────────────────────────

const listAuditLogs = async (req, res, next) => {
  try {
    const { action, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (action) where.action = { [Op.iLike]: `%${action}%` };

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [
        {
          model: User, as: 'performer',
          attributes: ['id', 'name', 'email', 'role'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    res.json({ logs: rows, total: count });
  } catch (err) { next(err); }
};

// ── Robots update / delete ─────────────────────────────────────────────────

const listAllLocations = async (req, res, next) => {
  try {
    const { Location } = require('../models');
    const locations = await Location.findAll({ attributes: ['id', 'name', 'address'], order: [['name', 'ASC']] });
    res.json(locations);
  } catch (err) { next(err); }
};

const updateRobot = async (req, res, next) => {
  try {
    const { name, status, organization_id, location_id } = req.body;
    const robot = await TemiRobot.findByPk(req.params.id);
    if (!robot) return res.status(404).json({ error: 'Robot not found' });
    if (name            != null) robot.name            = name;
    if (status          != null) robot.status          = status;
    if (organization_id !== undefined) robot.organization_id = organization_id || null;
    if (location_id     !== undefined) robot.location_id     = location_id     || null;
    await robot.save();
    res.json(robot);
  } catch (err) { next(err); }
};

const deleteRobot = async (req, res, next) => {
  try {
    const deleted = await TemiRobot.destroy({ where: { id: req.params.id } });
    if (!deleted) return res.status(404).json({ error: 'Robot not found' });
    res.json({ message: 'Robot deleted' });
  } catch (err) { next(err); }
};

module.exports = {
  listOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization,
  getPlatformAnalytics, getPlatformBilling, listAllRobots, listAllLocations,
  listAllUsers, createPlatformUser, updatePlatformUser, deletePlatformUser,
  listAllVisits, updatePlatformVisit, deletePlatformVisit,
  listAuditLogs,
  updateRobot, deleteRobot,
};
