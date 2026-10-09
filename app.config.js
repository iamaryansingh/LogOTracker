// Extends app.json. A free (Personal Team) Apple ID can't sign apps that use iCloud containers,
// so `SELF_MIRROR_PERSONAL_TEAM=1` builds without the iCloud entitlement. The app then reports
// iCloud sync as unavailable; everything else works the same.
// `SELF_MIRROR_TEAM_ID` sets the Apple signing team for local device builds.
const { withEntitlementsPlist } = require('expo/config-plugins');

// Smart prompts are local notifications scheduled on the phone; the app never uses remote push,
// so the push entitlement (which free accounts can't sign) is removed even if a library adds it.
const withoutPush = (config) =>
  withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });

module.exports = ({ config }) => {
  const teamId = process.env.SELF_MIRROR_TEAM_ID;
  const withTeam = withoutPush(teamId ? { ...config, ios: { ...config.ios, appleTeamId: teamId } } : config);
  if (process.env.SELF_MIRROR_PERSONAL_TEAM !== '1') return withTeam;
  return {
    ...withTeam,
    plugins: withTeam.plugins.filter((p) => (Array.isArray(p) ? p[0] : p) !== 'react-native-cloud-storage'),
  };
};
