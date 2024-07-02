function ensureAuthenticated(req, res, next) {
    if (req.session.userId) {
      return next();
    }
    res.status(401).send({ success: false, message: 'Please log in to continue' });
  }
  
  module.exports = ensureAuthenticated;
  