@roles
Feature: What each account may do in the project
  A Reader reads the project's work packages but changes none, and an account with no membership is refused the
  project.

  Scenario: A Reader reads a work package and changes nothing
    Given there is a work package "Webship test reader" in the project "webship-site"
    And I am a logged in user with the "reader" user
    When I open the work package "Webship test reader"
    Then I should not be able to change the status of the work package
    And I should not be able to log time on the work package
    And I should not be able to create a work package in the project "webship-site"

  @js-off
  Scenario: An account with no membership is refused the project
    Given I am a logged in user with the "stranger" user
    Then I should be refused the project "webship-site"
