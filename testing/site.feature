@site
Feature: The work packages of the site
  A first feature of an OpenProject site of the Webship Workspace, placed by the testing setup: a member logs in, reads
  the sample project's work packages and sprint, and works a work package of its own, which goes after the scenario.
  It passes on a site built with --install --add-users --sample-content; add your own features beside it.

  Scenario: A member reads the sample project
    Given I am a logged in user with the "member" user
    When I open the work packages of the project "webship-site"
    Then the work package list should show "The greeting script says Helo instead of Hello"
    When I open the backlog of the project "webship-site"
    Then the sprint "Sprint 1" should be "Active"
    And the sprint "Sprint 1" should list the work package "The greeting script says Helo instead of Hello"

  Scenario: A member works a work package of its own
    Given there is a work package "Webship test site" in the project "webship-site"
    And I am a logged in user with the "member" user
    When I open the work package "Webship test site"
    And I set the status of the work package to "In progress"
    And I comment "Checked on the test site" on the work package
    And I log "0.5" hours on the work package
    Then the work package should show the comment "Checked on the test site" by "Member Test"
    And the time spent on the work package should be "0.5h"

  @js-off
  Scenario: An account with no membership is refused the project
    Given I am a logged in user with the "stranger" user
    Then I should be refused the project "webship-site"
