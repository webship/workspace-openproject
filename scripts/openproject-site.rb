# frozen_string_literal: true

# The Webship Workspace's OpenProject builder and tool, run with OpenProject's own Rails runner in the site's
# container, as OpenProject's user:
#
#   bundle exec rails runner openproject-site.rb <verb>...
#
#   accounts  the accounts on the input (the base64 of a JSON list of login, mail, password, firstname, lastname,
#             admin, role, action): made, or given back their name, password and status, with the first login done
#             (no welcome dialog); with a role, a member of the sample project in it, without one a member of nothing
#             there; with the action "lock", locked (it cannot log in; its work stays).
#   content   the sample content: the project "Webship site" with its work packages, its active sprint and a comment,
#             each made where it is missing.
#   tidy      what a test run that was stopped half way left: its work packages ("Webship test …"), their time first.
#   list      the default accounts, and what the sample project holds.
#   token     an API token of the active account whose login is on the input, as "TOKEN <value>" (for --connect,
#             which writes it to the dashboard's settings; never shown).
#
# Nothing secret comes on its command line: passwords and logins travel on the input.

require 'base64'
require 'json'

PROJECT_IDENTIFIER = 'webship-site'
PROJECT_NAME = 'Webship site'
TEST_PREFIX = 'Webship test'
DEFAULT_LOGINS = %w[owner member reader stranger].freeze

def say(text)
  puts text
  $stdout.flush
end

# Kernel#warn says nothing when $VERBOSE is nil, as it is in a runner of the production environment.
def fail_with(text)
  $stderr.puts text
  $stderr.flush
  exit 1
end

def admin_user
  User.active.where(admin: true).order(:id).first || fail_with('No active administrator on the site.')
end

def errors_of(result)
  result.respond_to?(:errors) ? result.errors.full_messages.join('; ') : result.to_s
end

# The sample project, made the first time; its modules and the types the step pack and the tracker use are enabled
# every time, where they are missing.
def ensure_project
  project = Project.find_by(identifier: PROJECT_IDENTIFIER)
  unless project
    attributes = {
      name: PROJECT_NAME, identifier: PROJECT_IDENTIFIER, public: false,
      description: 'The sample project of a Webship Workspace site: its work packages, sprint and members are what the step pack and the tracker are tested on.'
    }
    # A project is one of the kinds of workspace since OpenProject 17 (project, program, portfolio).
    attributes[:workspace_type] = 'project' if Project.respond_to?(:workspace_types)
    result = Projects::CreateService.new(user: admin_user).call(**attributes)
    fail_with("The project #{PROJECT_NAME} could not be made: #{errors_of(result)}") unless result.success?
    project = result.result
    say "project: #{PROJECT_NAME} (#{PROJECT_IDENTIFIER}) made"
  end
  available = OpenProject::AccessControl.available_project_modules.map(&:to_s)
  modules = (project.enabled_module_names | %w[work_package_tracking backlogs costs board_view activity news]) & available
  if modules.sort != project.enabled_module_names.sort
    project.enabled_module_names = modules
    project.save!
  end
  wanted = Type.where(name: ['Task', 'Bug', 'Feature', 'Milestone', 'User story', 'Epic']).to_a
  if project.respond_to?(:project_types)
    # OpenProject 17: a type is enabled in a project by a row of its own (with its variant, the type's own by default).
    have = project.project_types.pluck(:type_id)
    wanted.each { |type| project.project_types.create!(type_id: type.id) unless have.include?(type.id) }
  elsif (wanted - project.types.to_a).any?
    project.types = (project.types.to_a | wanted)
    project.save!
  end
  project
end

def role_named(name)
  (defined?(ProjectRole) ? ProjectRole.find_by(name:) : nil) || Role.find_by(name:) || fail_with("No role #{name} on the site.")
end

# The account's membership of the sample project: in the role, or none.
def membership(project, user, role_name)
  member = Member.find_by(project_id: project.id, user_id: user.id)
  if role_name.to_s.empty?
    if member
      member.destroy
      say "  #{user.login}: no longer a member of #{PROJECT_NAME}"
    end
    return
  end
  role = role_named(role_name)
  if member
    member.role_ids = [role.id]
    member.save!
  else
    Member.new(project:, principal: user, roles: [role]).save!
  end
  say "  #{user.login}: #{role.name} of #{PROJECT_NAME}"
end

def accounts(rows)
  project = rows.any? { |r| !r['role'].to_s.empty? } ? ensure_project : Project.find_by(identifier: PROJECT_IDENTIFIER)
  rows.each do |r|
    login = r['login'].to_s
    fail_with('An account row has no login.') if login.empty?
    user = User.find_by(login:)
    if r['action'] == 'lock'
      if user.nil?
        say "  #{login}: no such account"
      elsif user.admin?
        say "  #{login}: an administrator, left as it is"
      else
        user.update!(status: :locked)
        say "  #{login}: locked"
      end
      next
    end
    user ||= User.new(login:)
    user.mail = r['mail'].to_s
    user.firstname = r['firstname'].to_s.empty? ? login.capitalize : r['firstname']
    user.lastname = r['lastname'].to_s.empty? ? 'Test' : r['lastname']
    user.admin = true if r['admin']
    user.status = :active
    user.language = 'en'
    user.first_login = false
    user.force_password_change = false
    user.password = r['password']
    user.password_confirmation = r['password']
    fail_with("The account #{login} could not be saved: #{user.errors.full_messages.join('; ')}") unless user.save
    say "  #{login}: #{user.admin? ? 'administrator' : 'account'} ready (#{user.mail})"
    membership(project, user, r['role']) if project && (r.key?('role') && !r['admin'])
  end
end

def create_work_package(project, by, type, subject, body, assignee: nil)
  existing = WorkPackage.find_by(project_id: project.id, subject:)
  return [existing, false] if existing

  attrs = { project:, type:, subject:, description: body }
  attrs[:assigned_to] = assignee if assignee
  result = WorkPackages::CreateService.new(user: by).call(**attrs)
  fail_with("The work package \"#{subject}\" could not be made: #{errors_of(result)}") unless result.success?
  [result.result, true]
end

def content
  project = ensure_project
  owner, member, stranger = %w[owner member stranger].map { |l| User.find_by(login: l) }
  fail_with('The default accounts are not on the site: add them first (--add-users).') unless owner && member && stranger

  status = Sprint.statuses.key?('active') ? 'active' : Sprint.statuses.keys.first
  sprint = Sprint.find_by(project_id: project.id, name: 'Sprint 1') ||
           Sprint.create!(project:, name: 'Sprint 1', start_date: Date.current, finish_date: Date.current + 11, status:)
  task = Type.find_by(name: 'Task') || fail_with('No type Task on the site.')
  bug = Type.find_by(name: 'Bug') || task

  greeting, made = create_work_package(project, owner, task, 'The greeting script says Helo instead of Hello', <<~MD, assignee: member)
    ### Problem/Motivation

    `bash greeting.sh World` prints `Helo, World!`.

    ### Proposed resolution

    Print `Hello, World!`, and keep the usage line as it is.
  MD
  if made
    greeting.update_column(:sprint_id, sprint.id)
    progress = Status.find_by(name: 'In progress')
    WorkPackages::UpdateService.new(user: owner, model: greeting.reload).call(status: progress) if progress
    AddWorkPackageNoteService.new(user: owner, work_package: greeting.reload).call('The script is in the project\'s repository: `greeting.sh`.')
  end
  create_work_package(project, member, bug, 'The usage page spells greeting as greting', <<~MD)
    ### Problem/Motivation

    The usage line of `greeting.sh` says "greting".

    ### Proposed resolution

    Spell it "greeting".
  MD
  outside, made = create_work_package(project, owner, task, 'A work package opened by someone outside the project', <<~MD)
    Please also print the date after the greeting.
  MD
  if made
    # Opened by an account with no membership: the tracker treats it as from outside the project.
    outside.update_column(:author_id, stranger.id)
    outside.journals.order(:version).first&.update_column(:user_id, stranger.id)
  end
  say "content: #{PROJECT_NAME} holds #{WorkPackage.where(project_id: project.id).count} work packages, #{sprint.name} (#{sprint.status})"
end

def tidy
  admin = admin_user
  left = WorkPackage.where('subject LIKE ?', "#{TEST_PREFIX}%").to_a
  left.each do |wp|
    TimeEntry.where(entity: wp).delete_all
    result = WorkPackages::DeleteService.new(user: admin, model: wp).call
    wp.destroy unless result.success?
  end
  say "tidy: #{left.size} work package(s) of a stopped test run removed"
end

def list
  project = Project.find_by(identifier: PROJECT_IDENTIFIER)
  say 'Accounts:'
  User.not_builtin.where(login: DEFAULT_LOGINS).or(User.not_builtin.where(admin: true)).order(:id).each do |u|
    role = project && Member.find_by(project_id: project.id, user_id: u.id)&.roles&.map(&:name)&.join(', ')
    say format('  %-12s %-28s %-8s %s', u.login, u.mail, u.status, u.admin? ? 'administrator' : (role.to_s.empty? ? 'no membership' : role))
  end
  return say("No project #{PROJECT_NAME} (#{PROJECT_IDENTIFIER}) yet: --sample-content adds it.") unless project

  wps = WorkPackage.where(project_id: project.id)
  say "#{PROJECT_NAME} (#{PROJECT_IDENTIFIER}): #{wps.count} work packages (#{wps.joins(:status).where(statuses: { is_closed: false }).count} open), " \
      "#{Sprint.where(project_id: project.id).count} sprint(s), #{TimeEntry.where(project_id: project.id).count} time entries"
end

# A new API token of the account, named for the workspace; the ones it made before for that account are revoked, so
# one token of the workspace's stays valid.
def token(login)
  user = User.active.find_by(login:) || fail_with("No active account #{login} on the site.")
  Token::API.where(user:).select { |t| t.respond_to?(:token_name) && t.token_name.to_s.start_with?('Webship Workspace') }.each(&:destroy)
  made = Token::API.create!(user:, token_name: "Webship Workspace #{Time.now.utc.strftime('%Y-%m-%d %H:%M:%S')}")
  puts "TOKEN #{made.plain_value}"
end

verbs = ARGV.dup
fail_with('A verb, please: accounts, content, tidy, list or token.') if verbs.empty?
verbs.each do |verb|
  case verb
  when 'accounts'
    raw = $stdin.read.to_s.strip
    fail_with('accounts reads the base64 of a JSON list on its input.') if raw.empty?
    accounts(JSON.parse(Base64.decode64(raw)))
  when 'content' then content
  when 'tidy' then tidy
  when 'list' then list
  when 'token' then token($stdin.gets.to_s.strip)
  else fail_with("Not a verb: #{verb} (accounts, content, tidy, list, token).")
  end
end
